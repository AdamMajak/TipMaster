"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.espnProxy = void 0;
const functions = __importStar(require("firebase-functions"));
const ESPN_ORIGIN = 'https://site.api.espn.com';
function stripEspnPrefix(url) {
    const trimmed = url?.trim?.() ?? '';
    if (!trimmed)
        return '/';
    if (trimmed === '/espn')
        return '/';
    if (trimmed.startsWith('/espn/'))
        return trimmed.slice('/espn'.length);
    return trimmed;
}
exports.espnProxy = functions.https.onRequest(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.status(405).json({ error: 'Method not allowed.' });
        return;
    }
    const upstreamPathAndQuery = stripEspnPrefix(req.url);
    if (!upstreamPathAndQuery.startsWith('/apis/')) {
        res.status(400).json({ error: 'Invalid ESPN proxy path.' });
        return;
    }
    const upstreamUrl = `${ESPN_ORIGIN}${upstreamPathAndQuery}`;
    try {
        const upstreamResponse = await fetch(upstreamUrl, {
            method: req.method,
            headers: {
                accept: req.get('accept') ?? '*/*',
            },
        });
        const contentType = upstreamResponse.headers.get('content-type');
        const cacheControl = upstreamResponse.headers.get('cache-control');
        if (contentType)
            res.setHeader('Content-Type', contentType);
        if (cacheControl)
            res.setHeader('Cache-Control', cacheControl);
        const body = Buffer.from(await upstreamResponse.arrayBuffer());
        res.status(upstreamResponse.status).send(body);
    }
    catch (err) {
        const message = err?.message ?? 'Upstream request failed.';
        res.status(502).json({ error: message, upstream: upstreamUrl });
    }
});
