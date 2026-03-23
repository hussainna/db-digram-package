<?php

namespace Hussain\DBDigram;

use Illuminate\Support\ServiceProvider;

class DbDigramServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__ . '/../config/db-digram.php', 'db-digram');
    }

    public function boot(): void
    {
        $this->publishes([
            __DIR__ . '/../config/db-digram.php' => config_path('db-digram.php'),
        ], 'db-digram-config');

        if (!config('db-digram.enabled', true)) {
            return;
        }

        $this->loadRoutesFrom(__DIR__ . '/Routes/web.php');
        $this->loadViewsFrom(__DIR__ . '/Resource/views', 'db-digram');
    }
}
