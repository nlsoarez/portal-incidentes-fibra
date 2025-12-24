<?php
/**
 * Proxy CORS para API SGO de Incidentes
 * Hospedado no Railway para uso com GitHub Pages
 *
 * Requisitos:
 * - Railway com PHP
 * - Acesso à rede da API (pode precisar de VPN no servidor)
 */

// Headers CORS - Permitir acesso de qualquer origem
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept, Origin');
header('Content-Type: application/json; charset=utf-8');

// Desabilitar cache
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

// Tratar requisições OPTIONS (preflight CORS)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// URL da API - pode ser configurada via variável de ambiente
$api_url = getenv('API_URL') ?: 'http://10.29.5.216/scr/sgo_incidentes_abertos.php';

// Validar hosts permitidos (segurança)
$allowed_hosts = ['10.29.5.216'];
$parsed_url = parse_url($api_url);

if (!isset($parsed_url['host']) || !in_array($parsed_url['host'], $allowed_hosts)) {
    http_response_code(403);
    echo json_encode([
        'error' => true,
        'message' => 'URL da API não permitida',
        'timestamp' => date('c')
    ], JSON_UNESCAPED_UNICODE);
    exit();
}

// Verificar se cURL está disponível
if (!function_exists('curl_init')) {
    http_response_code(500);
    echo json_encode([
        'error' => true,
        'message' => 'Extensão cURL não disponível',
        'timestamp' => date('c')
    ], JSON_UNESCAPED_UNICODE);
    exit();
}

// Configurar cURL
$ch = curl_init();

curl_setopt_array($ch, [
    CURLOPT_URL => $api_url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS => 3,
    CURLOPT_TIMEOUT => 60,
    CURLOPT_CONNECTTIMEOUT => 15,
    CURLOPT_USERAGENT => 'PortalIncidentesFibra/1.0 (Railway Proxy)',
    CURLOPT_HTTPHEADER => [
        'Accept: application/json',
        'Accept-Charset: utf-8'
    ],
    CURLOPT_ENCODING => '',
    CURLOPT_FAILONERROR => false,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_SSL_VERIFYHOST => false
]);

// Executar requisição
$response = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curl_error = curl_error($ch);
$curl_errno = curl_errno($ch);
$total_time = curl_getinfo($ch, CURLINFO_TOTAL_TIME);

curl_close($ch);

// Tratar erros de cURL
if ($response === false || $curl_errno !== 0) {
    http_response_code(502);

    $error_messages = [
        6 => 'Não foi possível resolver o host. Verifique se o servidor tem acesso à rede interna.',
        7 => 'Não foi possível conectar à API. Verifique a conectividade de rede.',
        28 => 'Timeout - A API demorou muito para responder.',
        35 => 'Erro de conexão SSL.'
    ];

    $message = $error_messages[$curl_errno] ?? "Erro de conexão: $curl_error";

    echo json_encode([
        'error' => true,
        'message' => $message,
        'details' => [
            'curl_errno' => $curl_errno,
            'curl_error' => $curl_error
        ],
        'timestamp' => date('c')
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit();
}

// Tratar erro HTTP
if ($http_code >= 400) {
    http_response_code($http_code);
    echo json_encode([
        'error' => true,
        'message' => "A API retornou erro HTTP $http_code",
        'timestamp' => date('c')
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit();
}

// Decodificar JSON
$json_data = json_decode($response);
$json_error = json_last_error();

if ($json_error !== JSON_ERROR_NONE) {
    // Tentar limpar a resposta
    $cleaned = preg_replace('/^\xEF\xBB\xBF/', '', $response);
    $cleaned = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $cleaned);

    $json_data = json_decode($cleaned);

    if (json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(502);
        echo json_encode([
            'error' => true,
            'message' => 'A API não retornou JSON válido',
            'timestamp' => date('c')
        ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit();
    }
}

// Retornar sucesso
echo json_encode([
    'success' => true,
    'data' => $json_data,
    'proxy_info' => [
        'timestamp' => date('c'),
        'response_time_ms' => round($total_time * 1000, 2),
        'record_count' => is_array($json_data) ? count($json_data) : 1,
        'server' => 'railway'
    ]
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
