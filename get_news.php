<?php
// get_news.php: Endpoint for retrieving news articles from the Python script

// Enable error reporting for development only (remove in production)
// error_reporting(E_ALL);
// ini_set('display_errors', 1);

// Set proper headers for JSON API
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');
header('Cache-Control: no-cache, no-store, must-revalidate');

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
$keyword = isset($_GET['q']) ? trim($_GET['q']) : "earthquake";
$timespan = isset($_GET['timespan']) && in_array($_GET['timespan'], ['1h', '6h', '24h', '3d', '7d']) 
    ? $_GET['timespan'] 
    : "24h";

// Optional filtering by country
$country = isset($_GET['country']) ? trim($_GET['country']) : "";

// Execute Python script with proper escaping
$command = 'python gdelt.py ' . escapeshellarg($keyword) . ' ' . escapeshellarg($timespan);
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
    $output = stream_get_contents($pipes[1]);
    $error = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $return_value = proc_close($process);
    
    // Check for execution errors
    if ($return_value !== 0) {
        http_response_code(500);
        echo json_encode([
            "error" => "Script execution failed",
            "details" => $error,
            "status" => "error",
            "code" => $return_value
        ]);
        exit;
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
        http_response_code(500);
        echo json_encode([
            "error" => "Invalid JSON response: " . json_last_error_msg(),
            "status" => "error",
            "rawOutput" => substr($output, 0, 500) // Truncate for debugging
        ]);
        exit;
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
    http_response_code(500);
    echo json_encode([
        "error" => "Failed to execute script",
        "status" => "error"
    ]);
}
