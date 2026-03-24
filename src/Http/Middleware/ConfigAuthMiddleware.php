<?php

namespace Hussain\DBDigram\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ConfigAuthMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        if (!config('db-digram.auth.enabled', false)) {
            return $next($request);
        }

        $expectedEmail = (string) config('db-digram.auth.email', '');
        $expectedPassword = (string) config('db-digram.auth.password', '');
        $realm = (string) config('db-digram.auth.realm', 'DB Diagram Access');

        if ($expectedEmail === '' || $expectedPassword === '') {
            return response('DB Diagram authentication is enabled but credentials are not configured.', 500);
        }

        $providedEmail = (string) ($request->getUser() ?? '');
        $providedPassword = (string) ($request->getPassword() ?? '');

        if (
            hash_equals($expectedEmail, $providedEmail)
            && hash_equals($expectedPassword, $providedPassword)
        ) {
            return $next($request);
        }

        return response(
            'Authentication required: please provide your email and password.',
            401,
            [
                'WWW-Authenticate' => 'Basic realm="' . addslashes($realm) . '", charset="UTF-8"',
            ]
        );
    }
}