<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta name="csrf-token" content="{{ csrf_token() }}">
	<meta name="db-digram-auth-config" content='@json($authConfig ?? ["enabled" => false, "email" => "", "password" => ""])'>
	<title>DB Diagram UI</title>
	<link rel="stylesheet" href="{{ route('db-digram.assets.css') }}">
</head>
<body data-db-digram-auth-enabled="{{ !empty($authConfig['enabled']) ? '1' : '0' }}">
	<div id="authOverlay" class="auth-overlay" hidden>
		<div class="auth-card" role="dialog" aria-modal="true" aria-labelledby="authTitle">
			<h2 id="authTitle">Authentication Required</h2>
			<p class="auth-text">Please enter your email and password to access DB Diagram.</p>
			<form id="authForm" class="auth-form" autocomplete="off">
				<label>
					Email
					<input id="authEmailInput" type="email" required maxlength="120" placeholder="admin@example.com">
				</label>
				<label>
					Password
					<input id="authPasswordInput" type="password" required maxlength="120" placeholder="Password">
				</label>
				<p id="authError" class="auth-error" hidden>Invalid email or password.</p>
				<button type="submit" class="btn btn-primary">Login</button>
			</form>
		</div>
	</div>

	<div id="diagramApp">
	<header class="topbar">
		<div class="brand">DB Diagram Builder</div>
		<div class="toolbar">
			<button id="themeToggleBtn" class="btn" type="button" aria-label="Toggle color theme">Dark Mode</button>
			<button id="addTableBtn" class="btn btn-primary">Add Table</button>
			<button id="zoomOutBtn" class="btn">-</button>
			<button id="zoomInBtn" class="btn">+</button>
			<button id="autoZoomBtn" class="btn">Auto Zoom</button>
			<span id="zoomLevel" class="zoom-level">100%</span>
			<button id="exportDbBtn" class="btn">Export DB SQL</button>
			<input id="importInput" type="file" accept="application/json" hidden>
		</div>
	</header>

	<main class="workspace">
		<aside class="sidebar">
			<h2>Tables</h2>
			<ul id="tableList" class="table-list"></ul>
			<p class="hint">Tip: Drag table headers in the canvas to reposition them.</p>
		</aside>

		<section id="canvasWrap" class="canvas-wrap">
			<div id="scene" class="scene">
				<svg id="relationLayer" class="relation-layer"></svg>
				<div id="canvas" class="canvas"></div>
			</div>
		</section>
	</main>

	<dialog id="tableDialog" class="dialog dialog-table">
		<form id="tableForm" method="dialog" class="form table-create-form">
			<h3 id="tableDialogTitle">Add Table</h3>
			<label class="table-main-input">
				Table Name
				<input id="tableNameInput" type="text" required maxlength="60" placeholder="users">
			</label>

			<section id="tableColumnsBuilder" class="table-columns-builder">
				<div class="table-columns-head">
					<strong>Columns</strong>
				</div>
				<div id="tableColumnsList" class="table-columns-list"></div>
				<div class="table-columns-foot">
					<button type="button" id="addTableColumnBtn" class="btn">Add Column Field</button>
				</div>
			</section>
			<menu class="form-actions">
				<button type="button" id="cancelTableBtn" class="btn">Cancel</button>
				<button type="submit" id="tableSaveBtn" class="btn btn-primary">Save</button>
			</menu>
		</form>
	</dialog>

	<dialog id="columnDialog" class="dialog">
		<form id="columnForm" method="dialog" class="form">
			<h3 id="columnDialogTitle">Add Column</h3>

			<label>
				Column Name
				<input id="columnNameInput" type="text" required maxlength="60" placeholder="id">
			</label>

			<label>
				Data Type
				<input id="columnTypeInput" type="text" required maxlength="40" placeholder="INT">
			</label>

			<label>
				Default
				<input id="columnDefaultInput" type="text" maxlength="80" placeholder="NULL or value">
			</label>

			<div class="checkbox-row">
				<label><input id="pkInput" type="checkbox"> Primary Key</label>
				<label><input id="uniqueInput" type="checkbox"> Unique</label>
				<label><input id="notNullInput" type="checkbox"> Not Null</label>
			</div>

			<div class="checkbox-row">
				<label><input id="fkInput" type="checkbox"> Foreign Key</label>
			</div>

			<div id="fkSection" class="fk-section hidden">
				<label>
					Reference Table
					<select id="refTableInput"></select>
				</label>

				<label>
					Reference Column
					<select id="refColumnInput"></select>
				</label>
			</div>

			<menu class="form-actions">
				<button type="button" id="cancelColumnBtn" class="btn">Cancel</button>
				<button type="submit" class="btn btn-primary">Save</button>
			</menu>
		</form>
	</dialog>
	</div>

	<script src="{{ route('db-digram.assets.js') }}"></script>
</body>
</html>
