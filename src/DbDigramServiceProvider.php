<?php

namespace Hussain\DBDigram;

use Illuminate\Support\ServiceProvider;

class DbDigramServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        $this->loadRoutesFrom(__DIR__ . '/Routes/web.php');
        $this->loadViewsFrom(__DIR__ . '/Resource/views', 'db-digram');
    }
}
