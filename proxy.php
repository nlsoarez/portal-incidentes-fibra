<?php
// proxy.php - Proxy CORS para API SGO

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

// URL da API original
$api_url = 'http://10.29.5.216/scr/sgo_incidentes_abertos.php';

// Verificar se é uma requisição OPTIONS (preflight)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Configurações do cURL
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $api_url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 30);
curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);

// Configurar User-Agent
curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

// Para debug (remover em produção)
curl_setopt($ch, CURLOPT_VERBOSE, false);

// Capturar erros
curl_setopt($ch, CURLOPT_FAILONERROR, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);

// Fazer a requisição
$response = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);

curl_close($ch);

// Log de erros (para debug)
if ($error) {
    error_log("Proxy CORS Error: " . $error);
}

// Se houver erro, retornar JSON com erro
if ($response === false) {
    http_response_code(500);
    echo json_encode([
        'error' => true,
        'message' => 'Erro ao conectar com a API',
        'details' => $error,
        'timestamp' => date('Y-m-d H:i:s')
    ]);
    exit();
}

// Verificar se a resposta é válida JSON
$json_data = json_decode($response);
if (json_last_error() !== JSON_ERROR_NONE) {
    // Se não for JSON válido, tentar limpar a string
    $cleaned_response = mb_convert_encoding($response, 'UTF-8', 'UTF-8');
    $cleaned_response = preg_replace('/[^\x20-\x7E\x0A\x0D]/', '', $cleaned_response);
    
    // Tentar decodificar novamente
    $json_data = json_decode($cleaned_response);
    
    if (json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(500);
        echo json_encode([
            'error' => true,
            'message' => 'Resposta inválida da API',
            'details' => 'A API não retornou um JSON válido',
            'timestamp' => date('Y-m-d H:i:s')
        ]);
        exit();
    }
}

// Adicionar informações do proxy na resposta
$response_data = [
    'success' => true,
    'data' => $json_data,
    'proxy_info' => [
        'timestamp' => date('Y-m-d H:i:s'),
        'source' => $api_url,
        'processed_by' => 'proxy-cors-php'
    ]
];

echo json_encode($response_data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
?>
