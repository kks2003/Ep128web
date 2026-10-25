# Draws the app icon (web/shell/icons/icon.svg and the maskable variant);
# the PNG sizes are rendered from the SVGs in a browser.
# pixel font 5x7
F = {
 'E': ["11111","10000","10000","11110","10000","10000","11111"],
 'P': ["11110","10001","10001","11110","10000","10000","10000"],
 'T': ["11111","00100","00100","00100","00100","00100","00100"],
 'V': ["10001","10001","10001","10001","01010","01010","00100"],
 'C': ["01110","10001","10000","10000","10000","10001","01110"],
}
def word(text, x, y, px, colors):
    out = []
    for i, ch in enumerate(text):
        g = F[ch]; c = colors[i % len(colors)]
        for r, row in enumerate(g):
            for k, b in enumerate(row):
                if b == '1':
                    out.append(f'<rect x="{x + (i*6 + k)*px}" y="{y + r*px}" width="{px}" height="{px}" fill="{c}"/>')
    return '\n'.join(out)

def content():
    s = []
    # monitor body
    s.append('<rect x="78" y="70" width="356" height="276" rx="34" fill="url(#body)"/>')
    s.append('<rect x="78" y="70" width="356" height="276" rx="34" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="3"/>')
    # screen
    s.append('<rect x="104" y="94" width="304" height="212" rx="22" fill="url(#scr)"/>')
    # text: EP (Enterprise logo colours), TVC (TV Computer colours)
    px = 13
    s.append(word('EP', 256 - (11*px)//2, 118, px, ['#b65cff', '#3fe05a']))
    px2 = 11
    s.append(word('TVC', 256 - (17*px2)//2, 222, px2, ['#ffd23e', '#ff4b4b', '#3fe0e8']))
    # scanlines
    s.append('<rect x="104" y="94" width="304" height="212" rx="22" fill="url(#scan)"/>')
    # glare
    s.append('<path d="M126 104 h150 q-90 30 -160 110 v-88 q0 -22 10 -22z" fill="#fff" fill-opacity=".10"/>')
    # power led
    s.append('<circle cx="404" cy="326" r="6" fill="#ff3b3b"/>')
    s.append('<rect x="108" y="322" width="70" height="8" rx="4" fill="#000" fill-opacity=".18"/>')
    # stand
    s.append('<path d="M226 346 h60 l10 22 h-80z" fill="#bdb6a3"/>')
    # keyboard wedge
    s.append('<path d="M84 384 h344 l24 58 h-392z" fill="url(#kbd)"/>')
    keys = []
    rows = [(394, 13, 104, 22), (408, 13, 98, 23), (422, 12, 104, 23)]
    for (y, n, x0, w) in rows:
        for i in range(n):
            keys.append(f'<rect x="{x0 + i*w + (y-394)*0.6:.1f}" y="{y}" width="{w-5}" height="9" rx="2" fill="#2b2b33"/>')
    s.append('\n'.join(keys))
    s.append('<rect x="190" y="433" width="132" height="6" rx="2" fill="#2b2b33"/>')
    # Videoton red stripe
    s.append('<rect x="70" y="446" width="372" height="5" rx="2.5" fill="#e0242f"/>')
    return '\n'.join(s)

defs = '''<defs>
<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2f63"/><stop offset="1" stop-color="#0c0e22"/></linearGradient>
<linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1ecdd"/><stop offset="1" stop-color="#cfc7b2"/></linearGradient>
<radialGradient id="scr" cx=".5" cy=".45" r=".7"><stop offset="0" stop-color="#14306e"/><stop offset="1" stop-color="#050b22"/></radialGradient>
<pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="2" fill="#000" fill-opacity=".22"/></pattern>
<linearGradient id="kbd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#55555f"/><stop offset="1" stop-color="#3a3a42"/></linearGradient>
</defs>'''

def svg(scale):
    t = f'translate({256 - 256*scale} {256 - 256*scale}) scale({scale})'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
{defs}
<rect width="512" height="512" rx="{0 if scale < 1 else 96}" fill="url(#bg)"/>
<g transform="{t}">
{content()}
</g>
</svg>
'''
open('icon.svg', 'w').write(svg(1.0))
open('icon-maskable.svg', 'w').write(svg(0.78))
