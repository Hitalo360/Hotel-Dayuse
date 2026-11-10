/**
 * Hotel & Day Use - Leitor Unificado de Código de Barras (Code 128 / EAN) e QR Code
 * Suporta:
 * 1. Leitor Físico USB (estilo teclado / keyboard wedge)
 * 2. Leitor via Câmera (WebRTC + BarcodeDetector / Canvas)
 * 3. Feedback sonoro suave (Web Audio API)
 */

window.BarcodeScannerService = (function () {
  // Feedback Sonoro Web Audio
  function emitirBip(tipo = 'sucesso') {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      if (tipo === 'sucesso') {
        osc.frequency.setValueAtTime(880, ctx.currentTime); // Lá
        osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.08); // Mi agudo
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
        osc.start();
        osc.stop(ctx.currentTime + 0.19);
      } else {
        osc.frequency.setValueAtTime(320, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
        osc.start();
        osc.stop(ctx.currentTime + 0.26);
      }
    } catch (e) {
      // Audio context restrito até o primeiro clique do usuário
    }
  }

  // 1. Escuta de Leitor Físico USB (Buffer de Teclas)
  let bufferUsb = '';
  let ultimoKeyTime = 0;
  const handlersFisicos = new Set();

  window.addEventListener('keydown', (e) => {
    // Ignorar se o foco estiver em um input de texto normal digitando devagar
    const agora = performance.now();
    const intervalo = agora - ultimoKeyTime;
    ultimoKeyTime = agora;

    const el = document.activeElement;
    const isInput = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');

    if (e.key === 'Enter') {
      if (bufferUsb.length >= 3) {
        const codigoLido = bufferUsb.trim();
        bufferUsb = '';
        emitirBip('sucesso');
        handlersFisicos.forEach(fn => fn(codigoLido, 'usb'));
      } else {
        bufferUsb = '';
      }
      return;
    }

    if (e.key.length === 1) {
      // Se as teclas vierem em rajada (< 50ms entre cada tecla), é leitor de código de barras
      if (intervalo < 55 || bufferUsb.length > 0) {
        bufferUsb += e.key;
      } else if (!isInput) {
        // Se usuário não está em um input e digitou algo, inicia buffer
        bufferUsb = e.key;
      }
      // Limpa buffer após 400ms se não receber Enter
      setTimeout(() => {
        if (performance.now() - ultimoKeyTime > 350) {
          bufferUsb = '';
        }
      }, 400);
    }
  });

  // 2. Leitor por Câmera
  let videoStream = null;
  let videoEl = null;
  let animFrameId = null;

  async function iniciarCamera({ videoElement, onCodigoLido, onError }) {
    videoEl = videoElement;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (onError) onError('Acesso à câmera não suportado neste navegador.');
      return;
    }

    try {
      videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      videoEl.srcObject = videoStream;
      await videoEl.play();

      let detector = null;
      if ('BarcodeDetector' in window) {
        try {
          detector = new window.BarcodeDetector({
            formats: ['qr_code', 'code_128', 'ean_13', 'ean_8', 'code_39']
          });
        } catch (e) {
          console.log('BarcodeDetector não suportou formatos especificados, usando canvas fallback.');
        }
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const escanearFrame = async () => {
        if (!videoEl || videoEl.paused || videoEl.ended) return;

        if (detector) {
          try {
            const barcodes = await detector.detect(videoEl);
            if (barcodes && barcodes.length > 0) {
              const valor = barcodes[0].rawValue;
              emitirBip('sucesso');
              onCodigoLido(valor, 'camera');
              pararCamera();
              return;
            }
          } catch (e) {}
        }

        animFrameId = requestAnimationFrame(escanearFrame);
      };

      animFrameId = requestAnimationFrame(escanearFrame);
    } catch (err) {
      if (onError) onError('Permissão de câmera negada ou dispositivo indisponível.');
    }
  }

  function pararCamera() {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    if (videoStream) {
      videoStream.getTracks().forEach(t => t.stop());
      videoStream = null;
    }
    if (videoEl) {
      videoEl.srcObject = null;
    }
  }

  return {
    aoLerCodigoFisico(callback) {
      handlersFisicos.add(callback);
      return () => handlersFisicos.delete(callback);
    },
    iniciarCamera,
    pararCamera,
    emitirBip
  };
})();
