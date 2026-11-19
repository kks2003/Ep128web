// Ep128web: screen filters made with WebGL: the picture of the emulator's
// canvas (one texel per emulated pixel, one row per line) is drawn again
// with a shader on a canvas over it.
//   crtgl  CRT with a curved tube: beam shaped scanlines (wider for bright
//          pixels), aperture grille, glow, vignette, rounded corners
//   tv     PAL TV (composite / RF): the colour has a much smaller bandwidth
//          than the brightness (colours bleed), a little ghost and noise
//   green, amber, white   monochrome monitors with phosphor glow
// window.EpScreenFX.create(canvas) -> null without WebGL, or
//   { modes, setMode(mode), render(source) }
(function () {
  const MODES = { crtgl: 1, tv: 2, green: 3, amber: 4, white: 5 };

  const VS = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

  const FS = `
precision mediump float;
uniform sampler2D uTex;
uniform vec2 uTexSize;      // emulated pixels, lines
uniform vec2 uOutSize;      // output pixels
uniform int uMode;
uniform float uTime;
varying vec2 vUv;

vec3 tex(vec2 uv) { return texture2D(uTex, uv).rgb; }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
// the curved tube: k smaller = more curved
vec2 curve(vec2 uv, float k) {
  uv = uv * 2.0 - 1.0;
  vec2 o = abs(uv.yx) / k;
  uv += uv * o * o;
  return uv * 0.5 + 0.5;
}
float vignette(vec2 uv) {
  float v = 16.0 * uv.x * uv.y * (1.0 - uv.x) * (1.0 - uv.y);
  return pow(clamp(v, 0.0, 1.0), 0.2);
}
float corners(vec2 uv) {
  vec2 r = vec2(0.035, 0.045);
  vec2 d = max(abs(uv * 2.0 - 1.0) - (1.0 - r), 0.0) / r;
  return 1.0 - smoothstep(0.8, 1.0, length(d));
}
// the middle of the emulated line at uv (the beam's centre)
vec2 lineCentre(vec2 uv) { return vec2(uv.x, (floor(uv.y * uTexSize.y) + 0.5) / uTexSize.y); }
// a gaussian beam across the line: bright pixels make wider lines
vec3 beam(vec2 uv, vec3 c, float strength) {
  float f = fract(uv.y * uTexSize.y) - 0.5;
  float s = mix(0.17, 0.33, clamp(luma(c) * 1.2, 0.0, 1.0));
  float b = exp(-f * f / (2.0 * s * s));
  return c * mix(1.0, b * 1.55, strength);
}
vec3 grille() {
  float x = mod(gl_FragCoord.x, 3.0);
  return x < 1.0 ? vec3(1.0, 0.72, 0.72) : (x < 2.0 ? vec3(0.72, 1.0, 0.72) : vec3(0.72, 0.72, 1.0));
}
float noise(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 rgb2yuv(vec3 c) {
  return vec3(luma(c), dot(c, vec3(-0.147, -0.289, 0.436)), dot(c, vec3(0.615, -0.515, -0.100)));
}
vec3 yuv2rgb(vec3 y) {
  return vec3(y.x + 1.140 * y.z, y.x - 0.395 * y.y - 0.581 * y.z, y.x + 2.032 * y.y);
}

void main() {
  vec2 px = 1.0 / uTexSize;
  vec3 col;
  vec2 uv;
  if (uMode == 1) {
    uv = curve(vUv, 3.8);
    vec2 c = lineCentre(uv);
    vec3 s = tex(c) * 0.6 + (tex(c - vec2(px.x, 0.0)) + tex(c + vec2(px.x, 0.0))) * 0.2;
    vec3 glow = (tex(uv + vec2(2.0 * px.x, 0.0)) + tex(uv - vec2(2.0 * px.x, 0.0)) +
                 tex(uv + vec2(0.0, 1.5 * px.y)) + tex(uv - vec2(0.0, 1.5 * px.y))) * 0.25;
    col = beam(uv, s, 1.0) * mix(vec3(1.0), grille() * 1.22, 0.8) + glow * 0.18;
    col *= 1.12;
  } else if (uMode == 2) {
    uv = curve(vUv, 7.0);
    vec2 c = lineCentre(uv);
    // brightness: a little soft; colour: blurred over ~8 pixels
    float y = luma(tex(c)) * 0.5 + (luma(tex(c - vec2(0.75 * px.x, 0.0))) + luma(tex(c + vec2(0.75 * px.x, 0.0)))) * 0.25;
    vec2 ch = vec2(0.0);
    for (int i = -4; i <= 4; i++) ch += rgb2yuv(tex(c + vec2(float(i) * px.x, 0.0))).yz;
    ch /= 9.0;
    col = yuv2rgb(vec3(y, ch * 1.1));
    col += tex(c - vec2(5.0 * px.x, 0.0)) * 0.06;                  // ghost
    col += (noise(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * 0.06;
    col = beam(uv, col, 0.35) * mix(vec3(1.0), grille() * 1.2, 0.15);
  } else {
    uv = curve(vUv, 6.0);
    vec2 c = lineCentre(uv);
    float l = luma(tex(c)) * 0.6 + (luma(tex(c - vec2(px.x, 0.0))) + luma(tex(c + vec2(px.x, 0.0)))) * 0.2;
    float g = 0.0;
    for (int i = -2; i <= 2; i++) g += luma(tex(uv + vec2(float(i) * 1.5 * px.x, 0.0))) + luma(tex(uv + vec2(float(i) * 1.5 * px.x, 2.0 * px.y)));
    g /= 10.0;
    vec3 tint = uMode == 3 ? vec3(0.25, 1.0, 0.35) : (uMode == 4 ? vec3(1.0, 0.66, 0.12) : vec3(0.92, 0.95, 1.0));
    l = pow(l, 0.85);
    col = beam(uv, tint * l * 1.1, 0.55) + tint * g * 0.3;
  }
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  col *= vignette(uv) * corners(uv);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

  function create(canvas) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true });
    if (!gl) return null;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    try {
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) {
      console.warn('screen filters:', e);
      return null;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const u = (n) => gl.getUniformLocation(prog, n);
    const uTexSize = u('uTexSize'), uOutSize = u('uOutSize'), uMode = u('uMode'), uTime = u('uTime');
    gl.uniform1i(u('uTex'), 0);
    let mode = 0;
    return {
      modes: Object.keys(MODES),
      setMode(m) { mode = MODES[m] || 0; },
      // draws the source canvas with the filter (the output follows the
      // canvas's size on the page)
      render(src) {
        if (!mode || !src.width) return;
        const dpr = window.devicePixelRatio || 1;
        const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        gl.viewport(0, 0, w, h);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
        gl.uniform2f(uTexSize, src.width, src.height);
        gl.uniform2f(uOutSize, w, h);
        gl.uniform1i(uMode, mode);
        gl.uniform1f(uTime, (performance.now() / 1000) % 1000);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    };
  }

  window.EpScreenFX = { create };
})();
