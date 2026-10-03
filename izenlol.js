// izen-bypass.js
'use strict';

/**
 * IzenBypass
 * Description: Bypass Mengambil Url Final Dari Berbagai platform Pastebin.com/sub4unlock dll
 * Credt By Zx?
 * Sumber Saluran: https://whatsapp.com/channel/0029VbDLqe7EquiSF4STU13o
 * Note: Kalau Mau Sher Lagi Minimal jangan hapus credit atau sumber ya kampung
 */

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36';

const DEFAULTS = Object.freeze({
  baseUrl: 'https://izen.lol',
  bypassPath: '/api/bypass',
  healthPath: '/api/health',
  turnstilePageUrl: 'https://izen.lol/bypass/sub2unlock',
  turnstileSiteKey: '0x4AAAAAADNEi_2N24gpQqY0',
  turnstileMode: 'min',
  referer: 'https://izen.lol/bypass/sub2unlock',
  concurrency: 1,
  maxQueue: 50,
  rateLimitMax: 5,
  rateLimitWindowMs: 60_000,
  rateLimitJitterMs: 150,
  autoSolveTurnstile: true,
  useWafSession: false,
  useBycf: true,
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class ScraperError extends Error {
  constructor(message, { cause = null, status = null, body = null, url = null } = {}) {
    super(message);
    this.name = 'ScraperError';
    this.cause = cause;
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

class RateLimiter {
  constructor({ max = 20, windowMs = 60_000, jitterMs = 150 } = {}) {
    this.max = Math.max(1, Number(max) || 1);
    this.windowMs = Math.max(1_000, Number(windowMs) || 60_000);
    this.jitterMs = Math.max(0, Number(jitterMs) || 0);
    this.timestamps = [];
  }

  async acquire() {
    for (;;) {
      const now = Date.now();
      this.timestamps = this.timestamps.filter((ts) => now - ts < this.windowMs);

      if (this.timestamps.length < this.max) {
        this.timestamps.push(now);
        return;
      }

      const oldest = this.timestamps[0];
      const wait = oldest + this.windowMs - now + Math.floor(Math.random() * this.jitterMs);
      await sleep(Math.max(wait, 10));
    }
  }

  stats() {
    return {
      max: this.max,
      windowMs: this.windowMs,
      used: this.timestamps.length,
    };
  }
}

class PromiseQueue {
  constructor({ concurrency = 2, maxQueue = 100 } = {}) {
    this.concurrency = Math.max(1, Number(concurrency) || 1);
    this.maxQueue = Math.max(0, Number(maxQueue) || 0);
    this.running = 0;
    this.queue = [];
  }

  get size() {
    return this.queue.length;
  }

  add(task, { signal } = {}) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new ScraperError('Task dibatalkan sebelum masuk queue.', { status: 499 }));
        return;
      }

      if (this.queue.length >= this.maxQueue) {
        reject(
          new ScraperError(
            'Queue penuh. Server/client sedang terlalu sibuk, coba lagi nanti.',
            { status: 429 }
          )
        );
        return;
      }

      const item = { task, resolve, reject, signal };

      const onAbort = () => {
        const idx = this.queue.indexOf(item);
        if (idx >= 0) {
          this.queue.splice(idx, 1);
          reject(new ScraperError('Task dibatalkan.', { status: 499 }));
        }
      };

      signal?.addEventListener('abort', onAbort, { once: true });
      this.queue.push(item);
      this._next();
    });
  }

  _next() {
    if (this.running >= this.concurrency || this.queue.length === 0) return;

    const item = this.queue.shift();
    if (!item) return this._next();

    if (item.signal?.aborted) {
      item.reject(new ScraperError('Task dibatalkan.', { status: 499 }));
      return this._next();
    }

    this.running += 1;

    Promise.resolve()
      .then(() => item.task())
      .then(
        (value) => item.resolve(value),
        (error) => item.reject(error)
      )
      .finally(() => {
        this.running -= 1;
        this._next();
      });
  }

  stats() {
    return {
      running: this.running,
      queued: this.queue.length,
      concurrency: this.concurrency,
      maxQueue: this.maxQueue,
    };
  }
}

class BycfHelper {
  constructor({ enabled = true, proxy = null, logger = console } = {}) {
    this.enabled = Boolean(enabled);
    this.proxy = proxy;
    this.logger = logger;
    this._sdk = null;
    this._loading = null;
  }

  async _load() {
    if (!this.enabled) {
      throw new ScraperError('BYCF helper dinonaktifkan.', { status: 400 });
    }

    if (this._sdk) return this._sdk;

    if (!this._loading) {
      this._loading = (async () => {
        let mod;

        try {
          mod = await import('bycf');
        } catch (error) {
          throw new ScraperError(
            'Package "bycf" belum terpasang. Jalankan: npm install bycf',
            { cause: error, status: 500 }
          );
        }

        const sdk = mod?.shz ?? mod?.default?.shz ?? mod?.default ?? mod;

        if (!sdk || (typeof sdk !== 'object' && typeof sdk !== 'function')) {
          throw new ScraperError('Format package bycf tidak dikenali.', { status: 500 });
        }

        this._sdk = sdk;
        return this._sdk;
      })();
    }

    return this._loading;
  }

  async _call(methodName, ...args) {
    const sdk = await this._load();
    const fn = sdk?.[methodName];

    if (typeof fn !== 'function') {
      throw new ScraperError(`bycf.${methodName} tidak tersedia.`, { status: 500 });
    }

    return fn.apply(sdk, args);
  }

  async stats() {
    return this._call('stats');
  }

  async turnstileMin(pageUrl, siteKey, proxy = null) {
    return this._call('turnstileMin', pageUrl, siteKey, proxy ?? this.proxy ?? null);
  }

  async turnstileMax(pageUrl, proxy = null) {
    return this._call('turnstileMax', pageUrl, proxy ?? this.proxy ?? null);
  }

  async wafSession(url, options = {}) {
    return this._call('wafSession', url, options);
  }

  async source(url) {
    return this._call('source', url);
  }
}

class IzenBypass {
  constructor(options = {}) {
    if (typeof fetch !== 'function') {
      throw new ScraperError(
        'Node.js versi 18+ dibutuhkan (global fetch tidak tersedia).',
        { status: 500 }
      );
    }

    this.baseUrl = options.baseUrl ?? DEFAULTS.baseUrl;
    this.bypassPath = options.bypassPath ?? DEFAULTS.bypassPath;
    this.healthPath = options.healthPath ?? DEFAULTS.healthPath;

    try {
      this.baseOrigin = new URL(this.baseUrl).origin;
    } catch {
      throw new ScraperError(`baseUrl tidak valid: ${this.baseUrl}`, { status: 400 });
    }

    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.referer = options.referer ?? DEFAULTS.referer;

    this.timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 30_000;
    this.retries = Math.max(1, Number(options.retries) || 3);
    this.retryDelayMs = Number(options.retryDelayMs) > 0 ? Number(options.retryDelayMs) : 750;

    this.cache = new Map();
    this.cacheTtlMs = Number(options.cacheTtlMs) >= 0 ? Number(options.cacheTtlMs) : 5 * 60_000;
    this.maxCacheSize = Number(options.maxCacheSize) > 0 ? Number(options.maxCacheSize) : 200;

    this.queue = new PromiseQueue({
      concurrency: options.concurrency ?? DEFAULTS.concurrency,
      maxQueue: options.maxQueue ?? DEFAULTS.maxQueue,
    });

    this.rateLimiter = new RateLimiter({
      max: options.rateLimit?.max ?? DEFAULTS.rateLimitMax,
      windowMs: options.rateLimit?.windowMs ?? DEFAULTS.rateLimitWindowMs,
      jitterMs: options.rateLimit?.jitterMs ?? DEFAULTS.rateLimitJitterMs,
    });

    this.logger = options.logger === null ? null : options.logger ?? console;

    this.turnstile = {
      pageUrl: options.turnstilePageUrl ?? DEFAULTS.turnstilePageUrl,
      siteKey: options.turnstileSiteKey ?? DEFAULTS.turnstileSiteKey,
      mode: options.turnstileMode ?? DEFAULTS.turnstileMode,
    };

    this.proxy = options.proxy ?? null;
    this.wafSessionOptions = options.wafSessionOptions ?? {};

    this.useBycf = options.useBycf ?? DEFAULTS.useBycf;
    this.useWafSession = options.useWafSession ?? DEFAULTS.useWafSession;
    this.autoSolveTurnstile = options.autoSolveTurnstile ?? DEFAULTS.autoSolveTurnstile;

    this.captchaTokenProvider =
      typeof options.captchaTokenProvider === 'function' ? options.captchaTokenProvider : null;

    this.bycf = new BycfHelper({
      enabled: this.useBycf,
      proxy: this.proxy,
      logger: this.logger ?? console,
    });

    this.session = null;
    this.cookie = '';
  }

  async health() {
    return this._request('GET', this.healthPath, {
      parse: 'json',
      retries: Math.max(1, this.retries),
    });
  }

  async bypass(targetUrl, opts = {}) {
    this._assertUrl(targetUrl);

    const {
      captchaToken = null,
      force = false,
      referer = null,
      timeoutMs = null,
      solveMode = null,
    } = opts;

    const cacheKey = `bypass:${targetUrl}`;

    if (!force) {
      const cached = this._cacheGet(cacheKey);
      if (cached) {
        return { ...cached, fromCache: true };
      }
    }

    return this.queue.add(async () => {
      await this._ensureSessionIfEnabled();

      const token = captchaToken || (await this._getCaptchaToken({ referer, mode: solveMode }));

      const payload = {
        url: targetUrl,
        captchaToken: token,
      };

      const data = await this._request('POST', this.bypassPath, {
        body: payload,
        referer: referer || this.turnstile.pageUrl || this.referer,
        timeoutMs,
        parse: 'json',
      });

      const normalized = this._normalizeBypassResponse(data, targetUrl);

      if (!normalized.success) {
        throw new ScraperError(data?.message || 'Respons API bypass tidak sukses.', {
          status: 502,
          body: data,
          url: targetUrl,
        });
      }

      this._cacheSet(cacheKey, normalized);
      return normalized;
    });
  }

  async bypassSafe(targetUrl, opts = {}) {
    try {
      const data = await this.bypass(targetUrl, opts);
      return { ok: true, url: targetUrl, data };
    } catch (error) {
      return {
        ok: false,
        url: targetUrl,
        error: error?.message ?? String(error),
        status: error?.status ?? null,
        body: error?.body ?? null,
      };
    }
  }

  /**
   * Bypass banyak URL sekaligus, tetap mengikuti queue & rate limiter.
   *
   * @param {string[]} urls
   * @param {object|Function} [opts]
   */
  async bulkBypass(urls, opts = {}) {
    if (!Array.isArray(urls)) {
      throw new ScraperError('urls harus berupa array.', { status: 400 });
    }

    return Promise.all(
      urls.map(async (url, index) => {
        const itemOpts = typeof opts === 'function' ? opts(url, index) : opts;

        try {
          const data = await this.bypass(url, itemOpts);
          return { url, ok: true, data };
        } catch (error) {
          return {
            url,
            ok: false,
            error: error?.message ?? String(error),
            status: error?.status ?? null,
            body: error?.body ?? null,
          };
        }
      })
    );
  }

  async solveTurnstile({
    pageUrl = this.turnstile.pageUrl,
    siteKey = this.turnstile.siteKey,
    mode = this.turnstile.mode,
  } = {}) {
    if (!siteKey) {
      throw new ScraperError('Turnstile siteKey kosong.', { status: 400 });
    }

    if (!pageUrl) {
      throw new ScraperError('Turnstile pageUrl kosong.', { status: 400 });
    }

    if (mode === 'max') {
      return this.bycf.turnstileMax(pageUrl, this.proxy);
    }

    try {
      const token = await this.bycf.turnstileMin(pageUrl, siteKey, this.proxy);
      if (token) return token;
    } catch (error) {
      this._warn('turnstileMin gagal, fallback ke turnstileMax.', error);
    }

    return this.bycf.turnstileMax(pageUrl, this.proxy);
  }

  async prepareSession({ force = false } = {}) {
    if (!this.useWafSession) return null;

    if (this.session && !force) return this.session;

    const session = await this.bycf.wafSession(this.baseUrl, this.wafSessionOptions);
    this.session = session;
    this.cookie = this._normalizeCookies(session?.cookies);

    return session;
  }

  async scrapeSource(url, { useBycf = true, timeoutMs = null } = {}) {
    this._assertUrl(url);

    if (useBycf && this.bycf.enabled) {
      return this.bycf.source(url);
    }

    return this._request('GET', url, {
      parse: 'text',
      timeoutMs,
    });
  }

  async scrapeJson(url, { timeoutMs = null, headers = {} } = {}) {
    this._assertUrl(url);

    return this._request('GET', url, {
      parse: 'json',
      timeoutMs,
      headers,
    });
  }

  async stats() {
    let bycfStats = null;

    try {
      bycfStats = await this.bycf.stats();
    } catch (error) {
      bycfStats = {
        error: error?.message ?? String(error),
      };
    }

    return {
      internal: {
        queue: this.queue.stats(),
        rateLimiter: this.rateLimiter.stats(),
        cacheSize: this.cache.size,
        sessionReady: Boolean(this.session || this.cookie),
        autoSolveTurnstile: this.autoSolveTurnstile,
        useWafSession: this.useWafSession,
      },
      bycf: bycfStats,
    };
  }

  setCaptchaTokenProvider(fn) {
    if (typeof fn !== 'function') {
      throw new ScraperError('captchaTokenProvider harus function.', { status: 400 });
    }

    this.captchaTokenProvider = fn;
    return this;
  }

  setProxy(proxy) {
    this.proxy = proxy;
    this.bycf.proxy = proxy;
    return this;
  }

  clearCache() {
    this.cache.clear();
    return this;
  }

  async _ensureSessionIfEnabled() {
    if (this.useWafSession) {
      await this.prepareSession();
    }
  }

  async _getCaptchaToken({ referer = null, mode = null } = {}) {
    if (this.captchaTokenProvider) {
      const token = await this.captchaTokenProvider({ scraper: this, referer });
      if (token) return token;
    }

    if (!this.autoSolveTurnstile) {
      throw new ScraperError(
        'captchaToken kosong. Kirim captchaToken, set captchaTokenProvider, atau aktifkan autoSolveTurnstile jika punya izin.',
        { status: 400 }
      );
    }

    return this.solveTurnstile({
      pageUrl: referer || this.turnstile.pageUrl,
      mode: mode || this.turnstile.mode,
    });
  }

  _normalizeBypassResponse(data, requestedUrl) {
    const status = data?.status;
    const result = data?.result;
    const time = data?.time != null ? Number(data.time) : null;

    if (status === 'success' && result) {
      return {
        success: true,
        result,
        time: Number.isFinite(time) ? time : null,
        requestedUrl,
        raw: data,
        fromCache: false,
      };
    }

    if (status === undefined && result) {
      return {
        success: true,
        result,
        time: Number.isFinite(time) ? time : null,
        requestedUrl,
        raw: data,
        fromCache: false,
      };
    }

    return {
      success: false,
      result: null,
      time: null,
      requestedUrl,
      raw: data,
      fromCache: false,
    };
  }

  _normalizeCookies(cookies) {
    if (!cookies) return '';

    if (typeof cookies === 'string') return cookies;

    if (Array.isArray(cookies)) {
      return cookies.filter(Boolean).join('; ');
    }

    if (typeof cookies === 'object') {
      return Object.entries(cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');
    }

    return '';
  }

  async _request(method, path, opts = {}) {
    const {
      body,
      referer,
      headers = {},
      timeoutMs = null,
      retries = this.retries,
      parse = 'json',
    } = opts;

    const targetUrl = new URL(path, this.baseUrl);
    const url = targetUrl.toString();

    let lastError;

    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        await this.rateLimiter.acquire();

        const requestHeaders = {
          'User-Agent': this.userAgent,
          Accept:
            parse === 'json'
              ? 'application/json'
              : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          ...headers,
        };

        if (body !== undefined) {
          requestHeaders['Content-Type'] = 'application/json';
        }

        if (referer) {
          requestHeaders.Referer = referer;
        } else if (this.referer) {
          requestHeaders.Referer = this.referer;
        }

        if (this.cookie && targetUrl.origin === this.baseOrigin) {
          requestHeaders.Cookie = this.cookie;
        }

        const response = await this._fetchWithTimeout(
          url,
          {
            method,
            headers: requestHeaders,
            body: body === undefined ? undefined : JSON.stringify(body),
          },
          timeoutMs ?? this.timeoutMs
        );

        const text = await response.text();

        let json = null;
        if (parse === 'json') {
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = { raw: text };
          }
        }

        if (response.ok) {
          return parse === 'json' ? json : text;
        }

        const error = new ScraperError(`HTTP ${response.status} dari ${method} ${url}`, {
          status: response.status,
          body: parse === 'json' ? json : { raw: text },
          url,
        });

        if (attempt < retries && this._isRetryableHttpStatus(response.status)) {
          const retryAfterHeader = response.headers?.get?.('retry-after');
          const retryAfter = Number(retryAfterHeader);
          const wait = Number.isFinite(retryAfter)
            ? retryAfter * 1000
            : this._backoffDelay(attempt);

          this._warn(`HTTP ${response.status}, retry ${attempt}/${retries} dalam ${wait}ms.`);
          await sleep(wait);
          continue;
        }

        throw error;
      } catch (error) {
        lastError = error;

        const canRetry = attempt < retries && this._isRetryableError(error);

        if (canRetry) {
          const wait = this._backoffDelay(attempt);
          this._warn(`Request gagal: ${error?.message}. Retry ${attempt}/${retries} dalam ${wait}ms.`);
          await sleep(wait);
          continue;
        }

        throw error;
      }
    }

    throw lastError ?? new ScraperError('Request gagal setelah beberapa percobaan.', { url });
  }

  async _fetchWithTimeout(url, options = {}, timeoutMs = 30_000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new ScraperError(`Timeout setelah ${timeoutMs} ms saat mengakses ${url}`, {
          cause: error,
          status: 408,
          url,
        });
      }

      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  _isRetryableHttpStatus(status) {
    return [408, 429, 500, 502, 503, 504].includes(status);
  }

  _isRetryableError(error) {
    if (error instanceof ScraperError && error.status) {
      return this._isRetryableHttpStatus(error.status);
    }

    if (error?.cause?.name === 'AbortError') return true;

    const message = String(error?.message || '').toLowerCase();
    return [
      'fetch failed',
      'network',
      'econnreset',
      'etimedout',
      'socket',
      'und_err',
      'eai_again',
    ].some((keyword) => message.includes(keyword));
  }

  _backoffDelay(attempt) {
    const base = this.retryDelayMs * 2 ** (attempt - 1);
    const jitter = Math.floor(Math.random() * 250);
    return Math.min(15_000, base + jitter);
  }

  _cacheGet(key) {
    if (this.cacheTtlMs <= 0) return null;

    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  _cacheSet(key, value) {
    if (this.cacheTtlMs <= 0) return;

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.cacheTtlMs,
    });

    if (this.cache.size > this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
  }

  _assertUrl(url) {
    if (typeof url !== 'string' || !url.trim()) {
      throw new ScraperError('URL wajib diisi.', { status: 400 });
    }

    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('invalid protocol');
      }
    } catch {
      throw new ScraperError(`URL tidak valid: ${url}`, { status: 400 });
    }
  }

  _warn(message, error = null) {
    if (!this.logger?.warn) return;

    if (error) {
      this.logger.warn(`[IzenBypass] ${message}`, error?.message ?? error);
    } else {
      this.logger.warn(`[IzenBypass] ${message}`);
    }
  }
}

module.exports = {
  IzenBypass,
  ScraperError,
  RateLimiter,
  PromiseQueue,
  BycfHelper,
  DEFAULTS,
};

// Contoh Penggunaan 

(async () => {
  const scraper = new IzenBypass();

  try {
    const result = await scraper.bypass('https://sfl.gl/7UE0TtK');
    console.log('Final URL:', result.result);
  } catch (error) {
    console.error('Gagal:', error.message);
  }
})();
