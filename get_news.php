<?php
// get_news.php: Endpoint for retrieving news articles from the Python script

// Enable error reporting for development only (remove in production)
// error_reporting(E_ALL);
// ini_set('display_errors', 1);

// Limits that stop any one client, or a burst of clients, from tying up the
// host with Python/pandas processes. Each can be overridden from the environment.
define('MAX_KEYWORD_LENGTH', 200);
define('SCRIPT_TIMEOUT_SECONDS', max(1, (int) (getenv('GDELT_SCRIPT_TIMEOUT') ?: 25)));
define('MAX_CONCURRENT_SCRIPTS', max(1, (int) (getenv('GDELT_MAX_CONCURRENT') ?: 4)));
define('RATE_LIMIT_REQUESTS', max(1, (int) (getenv('GDELT_RATE_LIMIT') ?: 20)));
define('RATE_LIMIT_WINDOW_SECONDS', 60);
define('STATE_DIR', getenv('GDELT_STATE_DIR') ?: sys_get_temp_dir() . '/gdelt-tracker-' . substr(hash('sha256', __DIR__), 0, 12));

// Set proper headers for JSON API. No CORS header: the bundled UI calls this
// endpoint from the same origin, so other sites have no need to read it.
header('Content-Type: application/json');
header('Cache-Control: no-cache, no-store, must-revalidate');

/**
 * Send a JSON error response and stop
 */
function send_error($status, $message, $extra = []) {
    http_response_code($status);
    echo json_encode(array_merge([
        "error" => $message,
        "status" => "error"
    ], $extra));
    exit;
}

/**
 * Log failure details server-side and return a short id the client can quote.
 * Script stderr (tracebacks, paths, library versions) never goes to the client.
 */
function log_failure($summary, $details = '') {
    $id = bin2hex(random_bytes(6));
    $message = "get_news.php [$id] $summary";
    if ($details !== '') {
        $message .= ": " . substr($details, 0, 8192);
    }
    error_log($message);
    return $id;
}

/**
 * Fixed-window per-IP request limit. Returns the seconds to wait, or 0 if allowed.
 */
function rate_limit_retry_after($ip) {
    $fh = @fopen(STATE_DIR . '/rate-' . hash('sha256', $ip), 'c+');
    if ($fh === false) {
        return 0; // The concurrency cap below still bounds the work
    }
    flock($fh, LOCK_EX);
    $parts = explode(' ', trim(stream_get_contents($fh)));
    $now = time();
    $start = (int) $parts[0];
    $count = isset($parts[1]) ? (int) $parts[1] : 0;
    if ($now - $start >= RATE_LIMIT_WINDOW_SECONDS) {
        $start = $now;
        $count = 0;
    }
    $count++;
    ftruncate($fh, 0);
    rewind($fh);
    fwrite($fh, "$start $count");
    flock($fh, LOCK_UN);
    fclose($fh);
    return $count > RATE_LIMIT_REQUESTS ? max(1, RATE_LIMIT_WINDOW_SECONDS - ($now - $start)) : 0;
}

/**
 * Take one of MAX_CONCURRENT_SCRIPTS lock slots. Returns the locked handle, or
 * null if every slot is busy. The lock is released when the handle is closed
 * or the request ends.
 */
function acquire_script_slot(&$usable) {
    $usable = false;
    for ($i = 0; $i < MAX_CONCURRENT_SCRIPTS; $i++) {
        // "e" (close-on-exec) keeps the lock out of the Python child
        $fh = @fopen(STATE_DIR . "/slot-$i.lock", 'ce');
        if ($fh === false) {
            continue;
        }
        $usable = true;
        if (flock($fh, LOCK_EX | LOCK_NB)) {
            return $fh;
        }
        fclose($fh);
    }
    return null;
}

// Process request if it's a GET request
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode([
        "error" => "Method not allowed. Use GET request.",
        "status" => "error"
    ]);
    exit;
}

// Validate and sanitize input parameters
$keyword = isset($_GET['q']) && is_string($_GET['q']) ? trim($_GET['q']) : "earthquake";
$timespan = isset($_GET['timespan']) && in_array($_GET['timespan'], ['1h', '6h', '24h', '3d', '7d'], true)
    ? $_GET['timespan']
    : "24h";

// A NUL byte cannot be passed on the command line: escapeshellarg() would throw
// and the request would end in an uncaught-exception 500 after a slot was taken.
if (strpos($keyword, "\0") !== false) {
    send_error(400, "Invalid search term.");
}

$keyword_length = function_exists('mb_strlen') ? mb_strlen($keyword, 'UTF-8') : strlen($keyword);
if ($keyword_length > MAX_KEYWORD_LENGTH) {
    send_error(400, "Search term is too long (maximum " . MAX_KEYWORD_LENGTH . " characters).");
}

// Optional filtering by country, limited to the countries the map knows about
$country = isset($_GET['country']) && is_string($_GET['country']) ? trim($_GET['country']) : "";
if ($country !== '') {
    $capitals = json_decode((string) @file_get_contents(__DIR__ . '/capitals.json'), true);
    if (!is_array($capitals) || !array_key_exists($country, $capitals)) {
        send_error(400, "Unknown country.");
    }
}

if (!is_dir(STATE_DIR)) {
    @mkdir(STATE_DIR, 0700, true);
}

// Per-IP rate limit
$retry_after = rate_limit_retry_after($_SERVER['REMOTE_ADDR'] ?? '');
if ($retry_after > 0) {
    header('Retry-After: ' . $retry_after);
    send_error(429, "Too many requests. Please wait a minute and try again.");
}

// Global cap on simultaneous Python processes
$slot = acquire_script_slot($slots_usable);
if ($slot === null) {
    if (!$slots_usable) {
        log_failure("cannot open lock files in " . STATE_DIR . " (set GDELT_STATE_DIR to a writable directory)");
    }
    header('Retry-After: 5');
    send_error(503, "The news service is busy. Please try again in a few seconds.");
}

// Execute Python script with proper escaping. "exec" makes the shell replace
// itself with Python, so the timeout below terminates the script itself.
$command = 'exec python src/gdelt.py ' . escapeshellarg($keyword) . ' ' . escapeshellarg($timespan);
if (!empty($country)) {
    $command .= ' ' . escapeshellarg($country);
}

// Capture both output and error streams
$descriptorspec = [
    1 => ["pipe", "w"], // stdout
    2 => ["pipe", "w"]  // stderr
];

$process = proc_open($command, $descriptorspec, $pipes);

if (is_resource($process)) {
    // Read both pipes together so neither can fill up and stall the child, and
    // stop waiting once the deadline passes.
    $output = '';
    $error = '';
    $open = [1 => $pipes[1], 2 => $pipes[2]];
    foreach ($open as $pipe) {
        stream_set_blocking($pipe, false);
    }
    $deadline = microtime(true) + SCRIPT_TIMEOUT_SECONDS;
    $timed_out = false;

    while ($open) {
        $remaining = $deadline - microtime(true);
        if ($remaining <= 0) {
            $timed_out = true;
            break;
        }
        $read = array_values($open);
        $write = null;
        $except = null;
        $seconds = (int) $remaining;
        if (stream_select($read, $write, $except, $seconds, (int) (($remaining - $seconds) * 1000000)) === false) {
            break;
        }
        foreach ($open as $fd => $pipe) {
            if (!in_array($pipe, $read, true)) {
                continue;
            }
            $chunk = fread($pipe, 8192);
            if ($chunk === false || $chunk === '') {
                if (feof($pipe)) {
                    fclose($pipe);
                    unset($open[$fd]);
                }
                continue;
            }
            if ($fd === 1) {
                $output .= $chunk;
            } else {
                $error .= $chunk;
            }
        }
    }

    if ($timed_out) {
        proc_terminate($process, 9);
    }
    foreach ($open as $pipe) {
        fclose($pipe);
    }
    $return_value = proc_close($process);
    fclose($slot);

    if ($timed_out) {
        $id = log_failure("gdelt.py killed after " . SCRIPT_TIMEOUT_SECONDS . "s timeout", $error);
        send_error(504, "The news service took too long to respond. Please try again.", ["requestId" => $id]);
    }

    // Check for execution errors
    if ($return_value !== 0) {
        $id = log_failure("gdelt.py exited with code $return_value", $error);
        send_error(500, "Failed to load news data. Please try again later.", ["requestId" => $id]);
    }

    // Check if output is empty
    if (empty($output)) {
        echo json_encode([
            "status" => "empty",
            "message" => "No results found for the given criteria.",
            "data" => []
        ]);
        exit;
    }

    // Attempt to decode JSON
    $decoded = json_decode($output, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        $id = log_failure("invalid JSON from gdelt.py (" . json_last_error_msg() . ")", substr($output, 0, 500));
        send_error(500, "Failed to load news data. Please try again later.", ["requestId" => $id]);
    }

    // Add metadata to response
    $response = [
        "status" => "success",
        "timestamp" => date('c'),
        "query" => [
            "keyword" => $keyword,
            "timespan" => $timespan,
            "country" => $country ?: null
        ],
        "totalResults" => count($decoded),
        "data" => $decoded
    ];

    echo json_encode($response);
} else {
    fclose($slot);
    $id = log_failure("proc_open failed for gdelt.py");
    send_error(500, "Failed to load news data. Please try again later.", ["requestId" => $id]);
}
