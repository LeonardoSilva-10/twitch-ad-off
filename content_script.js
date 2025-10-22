(() => {
    const pageScript = document.createElement('script');
    pageScript.type = 'text/javascript';
    pageScript.textContent = `
  
  (function() {
    const LOG_PREFIX = '[Twitch m3u8 interceptor]';
  
    // Basic m3u8 cleaning: remove segments between cue-out and cue-in markers,
    // and remove URIs that include common ad keywords.
    function cleanM3U8Text(text) {
      const lines = text.split('\\n');
      const out = [];
      let skipping = false;
  
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
  
        // Normalize for checks
        const llo = (line || '').toLowerCase();
  
        // If playlist contains ad cue markers, skip until cue-in
        if (llo.includes('#ext-x-cue-out') || llo.includes('#ext-x-ad') || llo.includes('#ad-')) {
          skipping = true;
          // keep the tag lines out (do not push) to avoid the player thinking there's an ad
          continue;
        }
        if (skipping) {
          if (llo.includes('#ext-x-cue-in') || llo.includes('#ext-x-cue-in:') || llo.includes('#ext-x-ad-complete')) {
            skipping = false;
            continue; // skip the cue-in line as well
          }
          // while skipping, avoid adding the URI and its metadata lines
          continue;
        }
  
        // If a URI line looks like an 'ad' segment (contains 'ad', 'stitched', 'stitched-ad', etc.), skip it.
        // A URI usually does NOT start with '#', so check non-tag lines for ad hints.
        if (!line.startsWith('#')) {
          if (llo.includes('ad') || llo.includes('stitched') || llo.includes('advert') || llo.includes('ad_') || llo.includes('ad-') || llo.includes('/ads/') || llo.includes('/ad/')) {
            // skip single URI suspected to be an ad segment
            continue;
          }
        }
  
        out.push(line);
      }
  
      // If we removed too much and the playlist would become invalid, a more conservative fallback would be needed.
      return out.join('\\n');
    }
  
    // Helper: attempt to detect playlist requests (very basic)
    function isPlaylistUrl(url) {
      try {
        const u = new URL(url, location.href);
        return u.pathname.endsWith('.m3u8') || u.search.includes('m3u8') || u.pathname.includes('playlist');
      } catch (e) {
        return false;
      }
    }
  
    // Save references to originals
    const originalFetch = window.fetch.bind(window);
    const originalXHR = window.XMLHttpRequest;
  
    // Override fetch
    window.fetch = async function(input, init) {
      try {
        const url = (typeof input === 'string') ? input : (input && input.url);
        if (url && isPlaylistUrl(url)) {
          // console.debug(LOG_PREFIX, 'Intercepting fetch ->', url);
          const resp = await originalFetch(input, init);
          // clone because body can be read once
          const cloned = resp.clone();
          const contentType = cloned.headers.get('content-type') || '';
          if (contentType.includes('application/vnd.apple.mpegurl') || url.includes('.m3u8')) {
            const text = await cloned.text();
            const cleaned = cleanM3U8Text(text);
            // create a new Response with the cleaned text and original headers where safe
            const newHeaders = new Headers(cloned.headers);
            // ensure content-length is not wrong (remove it)
            newHeaders.delete('content-length');
            return new Response(cleaned, {
              status: resp.status,
              statusText: resp.statusText,
              headers: newHeaders
            });
          }
          return resp;
        }
      } catch (err) {
        console.warn('[Twitch m3u8 interceptor] fetch override error', err);
        // fallthrough to original fetch
      }
      return originalFetch(input, init);
    };
  
    // Override XMLHttpRequest - for older player code that uses XHR to fetch playlists
    function XHRInterceptor() {
      const xhr = new originalXHR();
  
      // store original open/send
      const _open = xhr.open;
      const _send = xhr.send;
  
      let _url = null;
  
      xhr.open = function(method, url) {
        _url = url;
        return _open.apply(this, arguments);
      };
  
      xhr.send = function() {
        // If it's playlist, fetch ourselves then simulate load
        if (_url && isPlaylistUrl(_url)) {
          // perform our own fetch and synthesize response
          originalFetch(_url).then(async (r) => {
            const contentType = r.headers.get('content-type') || '';
            if (contentType.includes('application/vnd.apple.mpegurl') || _url.includes('.m3u8')) {
              const text = await r.text();
              const cleaned = cleanM3U8Text(text);
  
              // set response properties on xhr-like object and fire events
              try {
                Object.defineProperty(xhr, 'responseText', { value: cleaned });
                Object.defineProperty(xhr, 'status', { value: r.status });
              } catch (e) {
                // ignore if not possible
              }
              if (typeof xhr.onload === 'function') {
                xhr.onload();
              }
              if (typeof xhr.onreadystatechange === 'function') {
                xhr.readyState = 4;
                xhr.onreadystatechange();
              }
              return;
            } else {
              // if not a playlist, let normal XHR proceed
              _send.apply(this, arguments);
            }
          }).catch((e) => {
            // on error fallback to normal XHR
            _send.apply(this, arguments);
          });
          return;
        }
        return _send.apply(this, arguments);
      };
  
      return xhr;
    }
  
    // Replace global XMLHttpRequest constructor
    window.XMLHttpRequest = function() {
      return XHRInterceptor();
    };
  
    // Very small debug stub
    console.log('[Twitch m3u8 interceptor] injected');
  })();
  `;
    (document.documentElement || document.head || document.body).appendChild(pageScript);
    pageScript.remove();
  })();
  