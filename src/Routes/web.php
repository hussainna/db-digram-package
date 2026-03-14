<?php

use Hussain\DBDigram\Http\Controllers\TableMigrationController;
use Illuminate\Support\Facades\Route;

Route::middleware('web')->group(function (): void {
    Route::get('/diagram', function () {
        return view('db-digram::index');
    })->name('db-digram.index');

    Route::get('/diagram/assets/style.css', function () {
        $path = __DIR__ . '/../Resource/assets/style.css';

        abort_unless(is_file($path), 404);

        return response(file_get_contents($path), 200, [
            'Content-Type' => 'text/css; charset=UTF-8',
        ]);
    })->name('db-digram.assets.css');

    Route::get('/diagram/assets/scrypt.js', function () {
        $path = __DIR__ . '/../Resource/assets/scrypt.js';

        abort_unless(is_file($path), 404);

        return response(file_get_contents($path), 200, [
            'Content-Type' => 'application/javascript; charset=UTF-8',
        ]);
    })->name('db-digram.assets.js');

    Route::get('/diagram/schema', [TableMigrationController::class, 'schema']);
    Route::post('/diagram/tables', [TableMigrationController::class, 'store']);
    Route::put('/diagram/tables/{table}', [TableMigrationController::class, 'update']);
    Route::delete('/diagram/tables/{table}', [TableMigrationController::class, 'destroy']);
    Route::delete('/diagram/tables/{table}/columns/{column}', [TableMigrationController::class, 'destroyColumn']);
    Route::get('/diagram/export/sql', [TableMigrationController::class, 'exportSql']);
});
