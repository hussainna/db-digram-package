<?php

namespace Hussain\DBDigram\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class TableMigrationController extends Controller
{
    public function schema(): JsonResponse
    {
        $tables = Schema::getTables();

        $result = array_map(function (array $table): array {
            $tableName = (string) $table['name'];
            $columns = Schema::getColumns($tableName);
            $indexes = Schema::getIndexes($tableName);
            $foreignKeys = Schema::getForeignKeys($tableName);

            $primaryColumns = [];
            $uniqueColumns = [];

            foreach ($indexes as $index) {
                if (($index['primary'] ?? false) === true) {
                    foreach ($index['columns'] ?? [] as $columnName) {
                        $primaryColumns[] = (string) $columnName;
                    }
                }

                if (($index['unique'] ?? false) === true) {
                    foreach ($index['columns'] ?? [] as $columnName) {
                        $uniqueColumns[] = (string) $columnName;
                    }
                }
            }

            $primaryColumns = array_values(array_unique($primaryColumns));
            $uniqueColumns = array_values(array_unique($uniqueColumns));

            $foreignByColumn = [];
            foreach ($foreignKeys as $foreignKey) {
                $columnsInConstraint = $foreignKey['columns'] ?? [];
                $foreignColumns = $foreignKey['foreign_columns'] ?? [];

                foreach ($columnsInConstraint as $position => $columnName) {
                    $foreignByColumn[(string) $columnName] = [
                        'table' => (string) ($foreignKey['foreign_table'] ?? ''),
                        'column' => (string) ($foreignColumns[$position] ?? ''),
                    ];
                }
            }

            return [
                'name' => $tableName,
                'columns' => array_map(function (array $column) use ($primaryColumns, $uniqueColumns, $foreignByColumn): array {
                    $columnName = (string) ($column['name'] ?? 'column');
                    $reference = $foreignByColumn[$columnName] ?? null;

                    return [
                        'name' => $columnName,
                        'type' => (string) (($column['type'] ?? '') ?: ($column['type_name'] ?? 'TEXT')),
                        'defaultValue' => $column['default'] === null ? '' : (string) $column['default'],
                        'pk' => in_array($columnName, $primaryColumns, true),
                        'unique' => in_array($columnName, $uniqueColumns, true),
                        'notNull' => (($column['nullable'] ?? true) === false),
                        'fk' => $reference !== null,
                        'refTableName' => $reference['table'] ?? '',
                        'refColumnName' => $reference['column'] ?? '',
                    ];
                }, $columns),
            ];
        }, $tables);

        return response()->json([
            'tables' => $result,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:60', 'regex:/^[A-Za-z][A-Za-z0-9_]*$/'],
            'columns' => ['sometimes', 'array', 'max:30'],
            'columns.*.name' => ['required', 'string', 'max:60', 'regex:/^[A-Za-z][A-Za-z0-9_]*$/'],
            'columns.*.type' => ['required', 'string', 'in:string,text,integer,bigInteger,boolean,date,dateTime,decimal'],
            'columns.*.nullable' => ['sometimes', 'boolean'],
            'columns.*.unique' => ['sometimes', 'boolean'],
            'columns.*.default' => ['nullable', 'string', 'max:100'],
            'columns.*.fk' => ['sometimes', 'boolean'],
            'columns.*.refTableName' => ['nullable', 'string', 'max:60', 'regex:/^[A-Za-z][A-Za-z0-9_]*$/'],
            'columns.*.refColumnName' => ['nullable', 'string', 'max:60', 'regex:/^[A-Za-z][A-Za-z0-9_]*$/'],
        ]);

        $tableName = Str::snake($validated['name']);
        $columns = $this->normalizeColumns($validated['columns'] ?? []);

        if ($this->hasDuplicateColumnNames($columns)) {
            return response()->json([
                'message' => 'Duplicate column names are not allowed.',
            ], 422);
        }

        $reservedColumns = ['id', 'created_at', 'updated_at'];
        foreach ($columns as $column) {
            if (in_array($column['name'], $reservedColumns, true)) {
                return response()->json([
                    'message' => "Column '{$column['name']}' is reserved and created automatically.",
                ], 422);
            }

            if ($column['fk']) {
                if ($column['refTableName'] === '' || $column['refColumnName'] === '') {
                    return response()->json([
                        'message' => "Column '{$column['name']}' has foreign key enabled but missing reference table/column.",
                    ], 422);
                }

                if ($column['refTableName'] !== $tableName && !Schema::hasTable($column['refTableName'])) {
                    return response()->json([
                        'message' => "Referenced table '{$column['refTableName']}' for column '{$column['name']}' does not exist.",
                    ], 422);
                }
            }
        }

        if (Schema::hasTable($tableName)) {
            return response()->json([
                'message' => "Table '{$tableName}' already exists in the database.",
            ], 422);
        }

        $timestamp = now()->format('Y_m_d_His');
        $migrationName = "create_{$tableName}_table";
        $migrationFileName = "{$timestamp}_{$migrationName}.php";
        $relativeMigrationPath = "database/migrations/{$migrationFileName}";
        $fullMigrationPath = base_path($relativeMigrationPath);

        $columnDefinitions = implode("\n", $this->buildColumnDefinitions($columns));

        $migrationTemplate = <<<'PHP'
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('%s', function (Blueprint $table) {
            $table->id();
%s
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('%s');
    }
};
PHP;

    $migrationContent = sprintf($migrationTemplate, $tableName, $columnDefinitions, $tableName);

        if (file_put_contents($fullMigrationPath, $migrationContent) === false) {
            return response()->json([
                'message' => 'Failed to create migration file.',
            ], 500);
        }

        try {
            $exitCode = Artisan::call('migrate', [
                '--path' => $fullMigrationPath,
                '--realpath' => true,
                '--force' => true,
            ]);
        } catch (\Throwable $exception) {
            @unlink($fullMigrationPath);

            return response()->json([
                'message' => 'Migration command failed.',
                'error' => $exception->getMessage(),
                'output' => Artisan::output(),
            ], 500);
        }

        if ($exitCode !== 0) {
            @unlink($fullMigrationPath);

            return response()->json([
                'message' => 'Migration command failed.',
                'output' => Artisan::output(),
            ], 500);
        }

        return response()->json([
            'message' => "Table '{$tableName}' created successfully.",
            'table' => $tableName,
            'migration' => $migrationFileName,
        ], 201);
    }

    public function update(Request $request, string $table): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:60', 'regex:/^[A-Za-z][A-Za-z0-9_]*$/'],
            'columns' => ['sometimes', 'array', 'max:40'],
            'columns.*.name' => ['required', 'string', 'max:60', 'regex:/^[A-Za-z][A-Za-z0-9_]*$/'],
            'columns.*.type' => ['required', 'string', 'in:string,text,integer,bigInteger,boolean,date,dateTime,decimal'],
            'columns.*.nullable' => ['sometimes', 'boolean'],
            'columns.*.unique' => ['sometimes', 'boolean'],
            'columns.*.default' => ['nullable', 'string', 'max:100'],
            'columns.*.fk' => ['sometimes', 'boolean'],
            'columns.*.refTableName' => ['nullable', 'string', 'max:60', 'regex:/^[A-Za-z][A-Za-z0-9_]*$/'],
            'columns.*.refColumnName' => ['nullable', 'string', 'max:60', 'regex:/^[A-Za-z][A-Za-z0-9_]*$/'],
        ]);

        $currentTableName = Str::snake($table);
        $nextTableName = Str::snake($validated['name']);

        if (!Schema::hasTable($currentTableName)) {
            return response()->json([
                'message' => "Table '{$currentTableName}' does not exist in the database.",
            ], 404);
        }

        if ($currentTableName !== $nextTableName && Schema::hasTable($nextTableName)) {
            return response()->json([
                'message' => "Table '{$nextTableName}' already exists in the database.",
            ], 422);
        }

        $columns = $this->normalizeColumns($validated['columns'] ?? []);
        if ($this->hasDuplicateColumnNames($columns)) {
            return response()->json([
                'message' => 'Duplicate column names are not allowed.',
            ], 422);
        }

        $existingColumnNames = array_map(
            fn (array $column): string => (string) ($column['name'] ?? ''),
            Schema::getColumns($currentTableName)
        );
        $existingColumnLookup = array_fill_keys($existingColumnNames, true);
        $submittedColumnNames = array_values(array_map(
            fn (array $column): string => $column['name'],
            $columns
        ));
        $submittedColumnLookup = array_fill_keys($submittedColumnNames, true);

        $foreignKeysByColumn = [];
        foreach (Schema::getForeignKeys($currentTableName) as $foreignKey) {
            foreach (($foreignKey['columns'] ?? []) as $fkColumn) {
                $foreignKeysByColumn[(string) $fkColumn] = true;
            }
        }

        $columnsToAdd = array_values(array_filter($columns, function (array $column) use ($existingColumnLookup): bool {
            return !isset($existingColumnLookup[$column['name']]);
        }));

        $columnsToDrop = [];
        foreach ($existingColumnNames as $existingColumnName) {
            if (isset($submittedColumnLookup[$existingColumnName])) {
                continue;
            }

            if (in_array($existingColumnName, ['id', 'created_at', 'updated_at'], true)) {
                continue;
            }

            $columnsToDrop[] = [
                'name' => $existingColumnName,
                'fk' => isset($foreignKeysByColumn[$existingColumnName]),
            ];
        }

        $reservedColumns = ['id', 'created_at', 'updated_at'];
        foreach ($columnsToAdd as $column) {
            if (in_array($column['name'], $reservedColumns, true)) {
                return response()->json([
                    'message' => "Column '{$column['name']}' is reserved and cannot be added manually.",
                ], 422);
            }

            if ($column['fk']) {
                if ($column['refTableName'] === '' || $column['refColumnName'] === '') {
                    return response()->json([
                        'message' => "Column '{$column['name']}' has foreign key enabled but missing reference table/column.",
                    ], 422);
                }

                if ($column['refTableName'] !== $nextTableName && !Schema::hasTable($column['refTableName'])) {
                    return response()->json([
                        'message' => "Referenced table '{$column['refTableName']}' for column '{$column['name']}' does not exist.",
                    ], 422);
                }
            }
        }

        $shouldRename = $currentTableName !== $nextTableName;
        if (!$shouldRename && empty($columnsToAdd) && empty($columnsToDrop)) {
            return response()->json([
                'message' => 'No schema changes detected.',
                'table' => $currentTableName,
            ]);
        }

        $timestamp = now()->format('Y_m_d_His');
        $migrationName = "update_{$currentTableName}_table";
        $migrationFileName = "{$timestamp}_{$migrationName}.php";
        $relativeMigrationPath = "database/migrations/{$migrationFileName}";
        $fullMigrationPath = base_path($relativeMigrationPath);

        $upRenameBlock = $shouldRename
            ? "        Schema::rename('{$currentTableName}', '{$nextTableName}');\n"
            : '';

        $workingTableName = $shouldRename ? $nextTableName : $currentTableName;
        $upDropColumns = '';
        if (!empty($columnsToDrop)) {
            $dropDefinitions = implode("\n", $this->buildDropColumnDefinitions($columnsToDrop));
            $upDropColumns = "        Schema::table('{$workingTableName}', function (Blueprint " . '$table' . ") {\n{$dropDefinitions}\n        });\n";
        }

        $upAddColumns = '';
        if (!empty($columnsToAdd)) {
            $columnDefinitions = implode("\n", $this->buildColumnDefinitions($columnsToAdd));
            $upAddColumns = "        Schema::table('{$workingTableName}', function (Blueprint " . '$table' . ") {\n{$columnDefinitions}\n        });\n";
        }

        $downDropColumns = '';
        if (!empty($columnsToAdd)) {
            $dropDefinitions = implode("\n", $this->buildDropColumnDefinitions($columnsToAdd));
            $downDropColumns = "        Schema::table('{$workingTableName}', function (Blueprint " . '$table' . ") {\n{$dropDefinitions}\n        });\n";
        }

        $downRenameBlock = $shouldRename
            ? "        Schema::rename('{$nextTableName}', '{$currentTableName}');\n"
            : '';

        $migrationTemplate = <<<'PHP'
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
%s%s%s    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
%s%s    }
};
PHP;

        $migrationContent = sprintf(
            $migrationTemplate,
            $upRenameBlock,
            $upDropColumns,
            $upAddColumns,
            $downDropColumns,
            $downRenameBlock
        );

        if (file_put_contents($fullMigrationPath, $migrationContent) === false) {
            return response()->json([
                'message' => 'Failed to create migration file.',
            ], 500);
        }

        try {
            $exitCode = Artisan::call('migrate', [
                '--path' => $fullMigrationPath,
                '--realpath' => true,
                '--force' => true,
            ]);
        } catch (\Throwable $exception) {
            @unlink($fullMigrationPath);

            return response()->json([
                'message' => 'Migration command failed.',
                'error' => $exception->getMessage(),
                'output' => Artisan::output(),
            ], 500);
        }

        if ($exitCode !== 0) {
            @unlink($fullMigrationPath);

            return response()->json([
                'message' => 'Migration command failed.',
                'output' => Artisan::output(),
            ], 500);
        }

        return response()->json([
            'message' => "Table '{$currentTableName}' updated successfully.",
            'table' => $nextTableName,
            'migration' => $migrationFileName,
            'addedColumns' => array_values(array_map(fn (array $column): string => $column['name'], $columnsToAdd)),
            'renamed' => $shouldRename,
        ]);
    }

    public function exportSql(): \Symfony\Component\HttpFoundation\Response
    {
        $tables = Schema::getTables();
        $lines = [
            '-- DB Diagram SQL Export',
            '-- Generated at ' . now()->toDateTimeString(),
            '',
        ];

        foreach ($tables as $tableInfo) {
            $tableName = (string) ($tableInfo['name'] ?? '');
            if ($tableName === '') {
                continue;
            }

            $columns = Schema::getColumns($tableName);
            $indexes = Schema::getIndexes($tableName);
            $foreignKeys = Schema::getForeignKeys($tableName);

            $tableDefinitions = [];

            foreach ($columns as $column) {
                $columnName = (string) ($column['name'] ?? 'column');
                $columnType = $this->resolveSqlType($column);
                $columnLine = '    ' . $this->quoteIdentifier($columnName) . ' ' . $columnType;

                if (($column['nullable'] ?? true) === false) {
                    $columnLine .= ' NOT NULL';
                }

                if (array_key_exists('default', $column) && $column['default'] !== null) {
                    $columnLine .= ' DEFAULT ' . $this->formatSqlDefault((string) $column['default']);
                }

                $tableDefinitions[] = $columnLine;
            }

            foreach ($indexes as $index) {
                $columnsInIndex = array_values(array_filter(array_map(
                    fn ($indexColumn) => (string) $indexColumn,
                    $index['columns'] ?? []
                )));

                if (empty($columnsInIndex)) {
                    continue;
                }

                $columnList = implode(', ', array_map(fn (string $name) => $this->quoteIdentifier($name), $columnsInIndex));

                if (($index['primary'] ?? false) === true) {
                    $tableDefinitions[] = '    PRIMARY KEY (' . $columnList . ')';
                    continue;
                }

                if (($index['unique'] ?? false) === true) {
                    $indexName = (string) ($index['name'] ?? ($tableName . '_' . implode('_', $columnsInIndex) . '_unique'));
                    $tableDefinitions[] = '    CONSTRAINT ' . $this->quoteIdentifier($indexName) . ' UNIQUE (' . $columnList . ')';
                }
            }

            foreach ($foreignKeys as $foreignKey) {
                $localColumns = array_values(array_filter(array_map(
                    fn ($localColumn) => (string) $localColumn,
                    $foreignKey['columns'] ?? []
                )));

                $foreignColumns = array_values(array_filter(array_map(
                    fn ($foreignColumn) => (string) $foreignColumn,
                    $foreignKey['foreign_columns'] ?? []
                )));

                $foreignTable = (string) ($foreignKey['foreign_table'] ?? '');
                if (empty($localColumns) || empty($foreignColumns) || $foreignTable === '') {
                    continue;
                }

                $constraintName = (string) ($foreignKey['name'] ?? ($tableName . '_' . implode('_', $localColumns) . '_foreign'));
                $localList = implode(', ', array_map(fn (string $name) => $this->quoteIdentifier($name), $localColumns));
                $foreignList = implode(', ', array_map(fn (string $name) => $this->quoteIdentifier($name), $foreignColumns));
                $tableDefinitions[] = '    CONSTRAINT ' . $this->quoteIdentifier($constraintName)
                    . ' FOREIGN KEY (' . $localList . ') REFERENCES '
                    . $this->quoteIdentifier($foreignTable) . ' (' . $foreignList . ')';
            }

            $lines[] = 'CREATE TABLE ' . $this->quoteIdentifier($tableName) . ' (';
            $lines[] = implode(",\n", $tableDefinitions);
            $lines[] = ');';
            $lines[] = '';
        }

        $sql = implode("\n", $lines);
        $filename = 'db-schema-' . now()->format('Ymd_His') . '.sql';

        return response($sql, 200, [
            'Content-Type' => 'application/sql; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
        ]);
    }

    public function destroy(string $table): JsonResponse
    {
        $tableName = Str::snake($table);

        if (!Schema::hasTable($tableName)) {
            return response()->json([
                'message' => "Table '{$tableName}' does not exist in the database.",
            ], 404);
        }

        $timestamp = now()->format('Y_m_d_His');
        $migrationName = "drop_{$tableName}_table";
        $migrationFileName = "{$timestamp}_{$migrationName}.php";
        $fullMigrationPath = base_path("database/migrations/{$migrationFileName}");

        $migrationTemplate = <<<'PHP'
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('%s');
    }

    public function down(): void
    {
        // Intentionally left empty for drop table action.
    }
};
PHP;

        $migrationContent = sprintf($migrationTemplate, $tableName);
        if (file_put_contents($fullMigrationPath, $migrationContent) === false) {
            return response()->json([
                'message' => 'Failed to create migration file.',
            ], 500);
        }

        try {
            $exitCode = Artisan::call('migrate', [
                '--path' => $fullMigrationPath,
                '--realpath' => true,
                '--force' => true,
            ]);
        } catch (\Throwable $exception) {
            @unlink($fullMigrationPath);

            return response()->json([
                'message' => 'Migration command failed.',
                'error' => $exception->getMessage(),
                'output' => Artisan::output(),
            ], 500);
        }

        if ($exitCode !== 0) {
            @unlink($fullMigrationPath);

            return response()->json([
                'message' => 'Migration command failed.',
                'output' => Artisan::output(),
            ], 500);
        }

        return response()->json([
            'message' => "Table '{$tableName}' removed successfully.",
            'table' => $tableName,
            'migration' => $migrationFileName,
        ]);
    }

    public function destroyColumn(string $table, string $column): JsonResponse
    {
        $tableName = Str::snake($table);
        $columnName = Str::snake($column);

        if (!Schema::hasTable($tableName)) {
            return response()->json([
                'message' => "Table '{$tableName}' does not exist in the database.",
            ], 404);
        }

        if (!Schema::hasColumn($tableName, $columnName)) {
            return response()->json([
                'message' => "Column '{$columnName}' does not exist in table '{$tableName}'.",
            ], 404);
        }

        if (in_array($columnName, ['id', 'created_at', 'updated_at'], true)) {
            return response()->json([
                'message' => "Column '{$columnName}' is reserved and cannot be removed.",
            ], 422);
        }

        $hasForeignKey = false;
        foreach (Schema::getForeignKeys($tableName) as $foreignKey) {
            foreach (($foreignKey['columns'] ?? []) as $fkColumn) {
                if ((string) $fkColumn === $columnName) {
                    $hasForeignKey = true;
                    break 2;
                }
            }
        }

        $timestamp = now()->format('Y_m_d_His');
        $migrationName = "drop_{$columnName}_from_{$tableName}_table";
        $migrationFileName = "{$timestamp}_{$migrationName}.php";
        $fullMigrationPath = base_path("database/migrations/{$migrationFileName}");

        $dropDefinitions = implode("\n", $this->buildDropColumnDefinitions([
            ['name' => $columnName, 'fk' => $hasForeignKey],
        ]));

        $migrationTemplate = <<<'PHP'
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('%s', function (Blueprint $table) {
%s
        });
    }

    public function down(): void
    {
        // Intentionally left empty for drop column action.
    }
};
PHP;

        $migrationContent = sprintf($migrationTemplate, $tableName, $dropDefinitions);
        if (file_put_contents($fullMigrationPath, $migrationContent) === false) {
            return response()->json([
                'message' => 'Failed to create migration file.',
            ], 500);
        }

        try {
            $exitCode = Artisan::call('migrate', [
                '--path' => $fullMigrationPath,
                '--realpath' => true,
                '--force' => true,
            ]);
        } catch (\Throwable $exception) {
            @unlink($fullMigrationPath);

            return response()->json([
                'message' => 'Migration command failed.',
                'error' => $exception->getMessage(),
                'output' => Artisan::output(),
            ], 500);
        }

        if ($exitCode !== 0) {
            @unlink($fullMigrationPath);

            return response()->json([
                'message' => 'Migration command failed.',
                'output' => Artisan::output(),
            ], 500);
        }

        return response()->json([
            'message' => "Column '{$columnName}' removed from table '{$tableName}' successfully.",
            'table' => $tableName,
            'column' => $columnName,
            'migration' => $migrationFileName,
        ]);
    }

    private function normalizeColumns(array $columns): array
    {
        return array_map(function (array $column): array {
            return [
                'name' => Str::snake((string) ($column['name'] ?? '')),
                'type' => (string) ($column['type'] ?? 'string'),
                'nullable' => (bool) ($column['nullable'] ?? false),
                'unique' => (bool) ($column['unique'] ?? false),
                'default' => isset($column['default']) ? (string) $column['default'] : '',
                'fk' => (bool) ($column['fk'] ?? false),
                'refTableName' => Str::snake((string) ($column['refTableName'] ?? '')),
                'refColumnName' => Str::snake((string) ($column['refColumnName'] ?? '')),
            ];
        }, $columns);
    }

    private function hasDuplicateColumnNames(array $columns): bool
    {
        $names = array_map(fn (array $column): string => $column['name'], $columns);
        return count($names) !== count(array_unique($names));
    }

    private function buildColumnDefinitions(array $columns): array
    {
        return array_map(function (array $column): string {
            $name = str_replace("'", "\\'", $column['name']);
            $expression = match ($column['type']) {
                'text' => '$table->text(\'' . $name . '\')',
                'integer' => '$table->integer(\'' . $name . '\')',
                'bigInteger' => '$table->bigInteger(\'' . $name . '\')',
                'boolean' => '$table->boolean(\'' . $name . '\')',
                'date' => '$table->date(\'' . $name . '\')',
                'dateTime' => '$table->dateTime(\'' . $name . '\')',
                'decimal' => '$table->decimal(\'' . $name . '\', 10, 2)',
                default => '$table->string(\'' . $name . '\')',
            };

            if ($column['nullable']) {
                $expression .= '->nullable()';
            }

            if ($column['default'] !== '') {
                $default = str_replace("'", "\\'", $column['default']);
                $expression .= "->default('{$default}')";
            }

            if ($column['unique']) {
                $expression .= '->unique()';
            }

            $lines = ["            {$expression};"];

            if ($column['fk']) {
                $refTable = str_replace("'", "\\'", $column['refTableName']);
                $refColumn = str_replace("'", "\\'", $column['refColumnName']);
                $lines[] = "            " . '$table->foreign(\'' . $name . '\')->references(\'' . $refColumn . '\')->on(\'' . $refTable . '\');';
            }

            return implode("\n", $lines);
        }, $columns);
    }

    private function buildDropColumnDefinitions(array $columns): array
    {
        return array_map(function (array $column): string {
            $name = str_replace("'", "\\'", $column['name']);
            $lines = [];

            if (($column['fk'] ?? false) === true) {
                $lines[] = "            " . '$table->dropForeign([\'' . $name . '\']);';
            }

            $lines[] = "            " . '$table->dropColumn(\'' . $name . '\');';
            return implode("\n", $lines);
        }, $columns);
    }

    private function quoteIdentifier(string $identifier): string
    {
        return '"' . str_replace('"', '""', $identifier) . '"';
    }

    private function resolveSqlType(array $column): string
    {
        $type = trim((string) ($column['type'] ?? ''));
        if ($type !== '') {
            return strtoupper($type);
        }

        $typeName = trim((string) ($column['type_name'] ?? 'text'));
        return strtoupper($typeName);
    }

    private function formatSqlDefault(string $defaultValue): string
    {
        $trimmed = trim($defaultValue);

        if ($trimmed === '') {
            return "''";
        }

        if (preg_match('/^(true|false|null)$/i', $trimmed) === 1) {
            return strtoupper($trimmed);
        }

        if (is_numeric($trimmed)) {
            return $trimmed;
        }

        if (preg_match('/^[A-Za-z_][A-Za-z0-9_]*\(.*\)$/', $trimmed) === 1) {
            return $trimmed;
        }

        if (str_contains($trimmed, '::')) {
            return $trimmed;
        }

        return "'" . str_replace("'", "''", $trimmed) . "'";
    }
}
