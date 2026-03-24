<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Package Enabled
    |--------------------------------------------------------------------------
    |
    | Enable or disable all routes/views/features provided by this package.
    |
    */
    'enabled' => true,

    /*
    |--------------------------------------------------------------------------
    | Diagram Authentication
    |--------------------------------------------------------------------------
    |
    | Protect package routes with HTTP Basic Authentication credentials
    | defined here. Set enabled=false to disable this layer.
    |
    */
    'auth' => [
        'enabled' => env('DB_DIGRAM_AUTH_ENABLED', false),
        'email' => env('DB_DIGRAM_AUTH_EMAIL', ''),
        'password' => env('DB_DIGRAM_AUTH_PASSWORD', ''),
        'realm' => env('DB_DIGRAM_AUTH_REALM', 'DB Diagram Access'),
    ],
];
