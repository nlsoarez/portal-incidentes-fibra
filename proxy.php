<?php
/**
 * Proxy CORS para API SGO de Incidentes
 *
 * Este proxy resolve problemas de CORS ao fazer requisições
 * para a API interna a partir do navegador.
 *
 * Requisitos:
 * - PHP com extensão cURL habilitada
 * - Acesso à rede interna (VPN se necessário)
 */

// Headers CORS
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');
header('Content-Type: application/json; charset=utf-8');

// Desabilitar cache do navegador para sempre obter dados frescos
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

// URL da API original
$default_api_url = 'http://10.29.5.216/scr/sgo_incidentes_abertos.php';

// Permitir URL customizada via parâmetro (opcional, para testes)
$api_url = isset($_GET['api_url']) ? $_GET['api_url'] : $default_api_url;

// Validar que a URL é do servidor permitido (segurança)
$allowed_hosts = ['10.29.5.216'];
$parsed_url = parse_url($api_url);
if (!isset($parsed_url['host']) || !in_array($parsed_url['host'], $allowed_hosts)) {
    http_response_code(403);
    echo json_encode([
        'error' => true,
        'message' => 'URL da API não permitida',
        'timestamp' => date('Y-m-d H:i:s')
    ], JSON_UNESCAPED_UNICODE);
    exit();
}

// Verificar se é uma requisição OPTIONS (preflight CORS)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Verificar se cURL está disponível
if (!function_exists('curl_init')) {
    http_response_code(500);
    echo json_encode([
        'error' => true,
        'message' => 'Extensão cURL não está habilitada no PHP',
        'timestamp' => date('Y-m-d H:i:s')
    ], JSON_UNESCAPED_UNICODE);
    exit();
}

// Configurações do cURL
$ch = curl_init();

curl_setopt_array($ch, [
    CURLOPT_URL => $api_url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS => 3,
    CURLOPT_TIMEOUT => 60,           // Timeout total de 60 segundos
    CURLOPT_CONNECTTIMEOUT => 15,    // Timeout de conexão de 15 segundos
    CURLOPT_USERAGENT => 'PortalIncidentesFibra/1.0 (Proxy)',
    CURLOPT_HTTPHEADER => [
        'Accept: application/json',
        'Accept-Charset: utf-8'
    ],
    CURLOPT_ENCODING => '',           // Aceitar gzip/deflate automaticamente
    CURLOPT_FAILONERROR => false,
    CURLOPT_SSL_VERIFYPEER => false,  // Desabilitar verificação SSL (rede interna)
    CURLOPT_SSL_VERIFYHOST => false
]);

// Fazer a requisição
$response = curl_exec($ch);
$http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curl_error = curl_error($ch);
$curl_errno = curl_errno($ch);
$total_time = curl_getinfo($ch, CURLINFO_TOTAL_TIME);

curl_close($ch);

// Log para debug (verificar em logs do servidor)
if ($curl_error) {
    error_log("[ProxyCORS] Erro cURL ($curl_errno): $curl_error - URL: $api_url");
}

// Se houve erro de cURL
if ($response === false || $curl_errno !== 0) {
    http_response_code(502);

    $error_messages = [
        CURLE_COULDNT_RESOLVE_HOST => 'Não foi possível resolver o host da API. Verifique se a VPN está conectada.',
        CURLE_COULDNT_CONNECT => 'Não foi possível conectar à API. Verifique a conexão de rede e VPN.',
        CURLE_OPERATION_TIMEDOUT => 'A requisição excedeu o tempo limite. A API pode estar lenta ou inacessível.',
        CURLE_SSL_CONNECT_ERROR => 'Erro de conexão SSL.',
    ];

    $friendly_message = isset($error_messages[$curl_errno])
        ? $error_messages[$curl_errno]
        : 'Erro ao conectar com a API: ' . $curl_error;

    echo json_encode([
        'error' => true,
        'message' => $friendly_message,
        'details' => [
            'curl_error' => $curl_error,
            'curl_errno' => $curl_errno,
            'api_url' => $api_url
        ],
        'timestamp' => date('Y-m-d H:i:s')
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit();
}

// Se o HTTP code indica erro
if ($http_code >= 400) {
    http_response_code($http_code);
    echo json_encode([
        'error' => true,
        'message' => "A API retornou erro HTTP $http_code",
        'details' => [
            'http_code' => $http_code,
            'response_preview' => substr($response, 0, 500)
        ],
        'timestamp' => date('Y-m-d H:i:s')
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit();
}

// Tentar decodificar a resposta como JSON
$json_data = json_decode($response);
$json_error = json_last_error();

// Se não for JSON válido, tentar limpar a string
if ($json_error !== JSON_ERROR_NONE) {
    // Tentar diferentes encodings
    $cleaned_response = $response;

    // Remover BOM se presente
    $cleaned_response = preg_replace('/^\xEF\xBB\xBF/', '', $cleaned_response);

    // Tentar converter para UTF-8
    if (function_exists('mb_detect_encoding')) {
        $detected_encoding = mb_detect_encoding($cleaned_response, ['UTF-8', 'ISO-8859-1', 'Windows-1252'], true);
        if ($detected_encoding && $detected_encoding !== 'UTF-8') {
            $cleaned_response = mb_convert_encoding($cleaned_response, 'UTF-8', $detected_encoding);
        }
    }

    // Remover caracteres de controle inválidos (exceto newlines e tabs)
    $cleaned_response = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $cleaned_response);

    // Tentar decodificar novamente
    $json_data = json_decode($cleaned_response);
    $json_error = json_last_error();

    if ($json_error !== JSON_ERROR_NONE) {
        http_response_code(502);

        $json_error_messages = [
            JSON_ERROR_DEPTH => 'Profundidade máxima excedida',
            JSON_ERROR_STATE_MISMATCH => 'JSON malformado',
            JSON_ERROR_CTRL_CHAR => 'Caractere de controle inesperado',
            JSON_ERROR_SYNTAX => 'Erro de sintaxe no JSON',
            JSON_ERROR_UTF8 => 'Caracteres UTF-8 malformados'
        ];

        echo json_encode([
            'error' => true,
            'message' => 'A API não retornou um JSON válido',
            'details' => [
                'json_error' => isset($json_error_messages[$json_error])
                    ? $json_error_messages[$json_error]
                    : 'Erro desconhecido',
                'response_preview' => substr($response, 0, 500)
            ],
            'timestamp' => date('Y-m-d H:i:s')
        ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit();
    }
}

// Retornar resposta de sucesso com dados
$response_data = [
    'success' => true,
    'data' => $json_data,
    'proxy_info' => [
        'timestamp' => date('Y-m-d H:i:s'),
        'source' => $api_url,
        'response_time_ms' => round($total_time * 1000, 2),
        'http_code' => $http_code,
        'record_count' => is_array($json_data) ? count($json_data) : 1
    ]
];

echo json_encode($response_data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
