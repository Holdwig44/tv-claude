/*
 * TizenTube + Claude - service TizenBrew (Node 4.4.3 sur la TV, ES5 uniquement).
 * 1) Demarre le service officiel de TizenTube (serveur DIAL, etc.).
 * 2) Sert des captures d'ecran de la TV sur http://<IP-TV>:8097/shot (JPEG 480x270),
 *    via le service systeme display-capture-service (D-Bus samsung.tizen.dcapture).
 *    Methode decouverte par le projet Edsol/t3 (Samsung Tizen 3, 2017).
 * Lecture seule : ce service ne modifie rien sur la TV.
 */
(function (root) {
    'use strict';

    var VERSION = '1.0.2';
    var PORT = 8097;
    var TT_SERVICE = 'https://cdn.jsdelivr.net/npm/@foxreis/tizentube/dist/service.js';
    var DBUS = '/usr/bin/dbus-send';
    var NAME = 'samsung.tizen.dcapture';
    var OBJ = '/samsung/tizen/dcapture';
    var METHOD = NAME + '.RequestCaptureToFileSync';
    var DIR = '/dev/shm';
    var FILE = 'claude-shot';

    var fs = require('fs');
    var http = require('http');
    var cp = require('child_process');
    var vm = require('vm');

    var started = Date.now();
    var ttStatus = 'chargement';
    var shots = 0;
    var lastError = null;
    var busy = false;
    var waiting = [];

    function log(m) { try { console.log('[tv-claude] ' + m); } catch (e) { } }

    // ---------- 1) TizenTube officiel ----------
    function startTizenTube() {
        // https natif de Node (node-fetch n'est pas accessible depuis le bac a sable des modules)
        function get(url, redirects, cb) {
            var req;
            try { req = require('https').get(url, onRes); } catch (e) { cb(String(e)); return; }
            req.on('error', function (e) { cb(String(e)); });
            function onRes(res) {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
                    res.resume();
                    get(require('url').resolve(url, res.headers.location), redirects - 1, cb);
                    return;
                }
                if (res.statusCode !== 200) { res.resume(); cb('HTTP ' + res.statusCode); return; }
                var chunks = [];
                res.on('data', function (c) { chunks.push(c); });
                res.on('end', function () { cb(null, Buffer.concat(chunks).toString('utf8')); });
            }
        }
        get(TT_SERVICE, 3, function (err, code) {
            if (err) { ttStatus = 'erreur: ' + err; log(ttStatus); return; }
            try {
                var sb = {};
                try { Object.getOwnPropertyNames(root).forEach(function (k) { sb[k] = root[k]; }); } catch (e) { }
                // Node 4 (TV) : les variables du bac a sable TizenBrew ne sont pas listees, on les passe explicitement
                sb.require = require;
                sb.tizen = (typeof tizen !== 'undefined') ? tizen : undefined;
                sb.process = process;
                sb.console = console;
                sb.Buffer = Buffer;
                sb.setTimeout = setTimeout; sb.clearTimeout = clearTimeout;
                sb.setInterval = setInterval; sb.clearInterval = clearInterval;
                if (typeof setImmediate !== 'undefined') { sb.setImmediate = setImmediate; }
                sb.module = { exports: {} };
                sb.exports = sb.module.exports;
                vm.runInContext(code, vm.createContext(sb));
                ttStatus = 'ok';
                log('TizenTube service demarre');
            } catch (e) { ttStatus = 'erreur: ' + e; log(ttStatus); }
        });
    }

    // ---------- 2) Capture ----------
    function captureOnce(q, cb) {
        var target = DIR + '/' + FILE + '.jpg';
        try { fs.writeFileSync(target, ''); fs.chmodSync(target, 438); } catch (e) { }
        var args = ['--system', '--print-reply', '--reply-timeout=4000', '--type=method_call',
            '--dest=' + NAME, OBJ, METHOD,
            'int32:0', 'int32:0', 'int32:1', 'int32:0', 'int32:0', 'int32:' + q,
            'string:' + DIR, 'string:' + FILE];
        cp.execFile(DBUS, args, { timeout: 6000, maxBuffer: 1 << 20 }, function (err, stdout) {
            var m = /int32\s+(-?\d+)/.exec(String(stdout || ''));
            var ret = m ? parseInt(m[1], 10) : null;
            var buf = null;
            try { buf = fs.readFileSync(target); } catch (e) { }
            if (buf && buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8) { cb(null, buf); return; }
            cb('capture impossible (exit ' + (err ? (err.code != null ? err.code : err) : 0) + ', retVal ' + ret + ')');
        });
    }

    function capture(q, cb) {
        waiting.push({ q: q, cb: cb });
        pump();
    }
    function pump() {
        if (busy || waiting.length === 0) return;
        busy = true;
        var job = waiting.shift();
        captureOnce(job.q, function (err, buf) {
            busy = false;
            if (err) { lastError = err; } else { shots++; }
            try { job.cb(err, buf); } catch (e) { }
            pump();
        });
    }

    function json(res, code, obj) {
        res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(obj));
    }
    function query(url) {
        var q = {};
        (url.split('?')[1] || '').split('&').forEach(function (kv) {
            var a = kv.split('=');
            if (a[0]) { try { q[a[0]] = decodeURIComponent(a[1] || ''); } catch (e) { } }
        });
        return q;
    }

    function startServer() {
        var server = http.createServer(function (req, res) {
            var url = req.url || '/';
            var path = url.split('?')[0];
            if (path === '/shot') {
                var q = parseInt(query(url).q, 10);
                if (!(q >= 30 && q <= 100)) q = 92;
                capture(q, function (err, buf) {
                    if (err) { json(res, 500, { ok: false, error: err }); return; }
                    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': buf.length, 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
                    res.end(buf);
                });
                return;
            }
            if (path === '/' || path === '/ping') {
                json(res, 200, { ok: true, app: 'tv-claude', version: VERSION, uptimeSec: Math.round((Date.now() - started) / 1000), tizentube: ttStatus, shots: shots, lastError: lastError, node: process.version });
                return;
            }
            json(res, 404, { ok: false, error: 'route inconnue' });
        });
        server.on('error', function (e) { log('serveur: ' + (e && e.code)); });
        server.listen(PORT, '0.0.0.0', function () { log('captures sur :' + PORT + '/shot'); });
    }

    try { startServer(); } catch (e) { log('serveur KO ' + e); }
    startTizenTube();
})(this);
