#!/usr/bin/env python3
"""End-to-end test of the TVC256k++ card model inside the TVC64VM, without
the TVC system ROM: a tiny hand-assembled Z80 program runs as "system ROM" and
exercises the slot ROM, the register ports, fast RAM / PSRAM paging and the
U2/U3 RAM override.  Run from the repository root (needs g++, gcc):
    python3 test/native_card_test.py
"""
import os, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
E = os.path.join(ROOT, "ep128emu")
OBJ = os.path.join(tempfile.gettempdir(), "ep128web_cardtest")
os.makedirs(OBJ, exist_ok=True)

def apply_patches():
    # same logic as build.sh: apply every patch that is not applied yet
    pdir = os.path.join(ROOT, "patches")
    for name in sorted(os.listdir(pdir)):
        if not name.endswith(".patch"):
            continue
        patch = os.path.join(pdir, name)
        if subprocess.call(["git", "-C", E, "apply", "--check", patch],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) == 0:
            print("applying", name)
            subprocess.check_call(["git", "-C", E, "apply", patch])

def build(main_src="test/native_harness.cpp", name="harness"):
    apply_patches()
    cf = ["-O1", "-w", "-fpermissive", "-DHAVE_STDINT_H", "-DZ80_ENABLE_CMOS",
          "-DCPC_LSB_FIRST=1", "-DENABLE_SDEXT", "-I" + os.path.join(ROOT, "test/native_shim"),
          "-I" + os.path.join(ROOT, "web/stubs"), "-I" + os.path.join(ROOT, "web/src"),
          "-I" + E + "/src", "-I" + E + "/z80", "-I" + E]
    txt = open(os.path.join(ROOT, "build.sh")).read()
    block = txt.split('SOURCES="')[1].split('"')[0]
    srcs = [l.strip().replace("$E", E) for l in block.splitlines() if l.strip().endswith((".cpp", ".c"))]
    srcs = [s if os.path.isabs(s) else os.path.join(ROOT, s) for s in srcs]
    srcs.append(os.path.join(ROOT, main_src))
    objs = []
    for s in srcs:
        o = os.path.join(OBJ, s.replace("/", "_") + ".o")
        vendored = "/web/src/card/" in s
        cc = ["gcc", "-std=gnu11"] if s.endswith(".c") else ["g++", "-std=gnu++17"]
        extra = ["-Dmain=ep_unused_emscripten_main"] if s.endswith("web/src/main.cpp") else []
        if not os.path.exists(o) or os.path.getmtime(o) < os.path.getmtime(s):
            subprocess.check_call(cc + cf + extra + ["-c", s, "-o", o])
        objs.append(o)
    exe = os.path.join(OBJ, name)
    subprocess.check_call(["g++"] + objs + ["-o", exe])
    return exe

# --- a very small Z80 assembler (only what the test needs) -----------------
class Asm:
    def __init__(self): self.b = bytearray()
    def ld_a(self, n): self.b += bytes([0x3E, n])
    def out(self, p): self.b += bytes([0xD3, p])
    def inp(self, p): self.b += bytes([0xDB, p])
    def ld_a_mem(self, a): self.b += bytes([0x3A, a & 255, a >> 8])
    def ld_mem_a(self, a): self.b += bytes([0x32, a & 255, a >> 8])
    def ld_b_a(self): self.b.append(0x47)
    def ld_c_a(self): self.b.append(0x4F)
    def ld_d_a(self): self.b.append(0x57)
    def ld_e_a(self): self.b.append(0x5F)
    def ld_a_b(self): self.b.append(0x78)
    def ld_a_c(self): self.b.append(0x79)
    def ld_a_d(self): self.b.append(0x7A)
    def ld_a_e(self): self.b.append(0x7B)
    def di(self): self.b.append(0xF3)
    def halt_loop(self): self.b += bytes([0x18, 0xFE])
    # card register helpers (base = card base port)
    def reg_write(self, base, reg, val):
        self.ld_a(reg); self.out(base); self.ld_a(val); self.out(base + 1)
    def reg_read(self, base, reg):
        self.ld_a(reg); self.out(base); self.inp(base + 1)

def program(slot):
    base = 0x10 + 0x10 * slot
    a = Asm()
    a.di()
    a.ld_a(slot << 6); a.out(0x03)          # IOMEM page = card slot
    a.ld_a(0xE0); a.out(0x02)               # P2 = U2, P3 = IOMEM/EXT
    # A: ROM header through the slot ROM
    a.ld_a_mem(0xC000); a.ld_mem_a(0x8000)  # 'M'
    a.ld_a_mem(0xC00B); a.ld_mem_a(0x8001)  # init low  = 2E
    a.ld_a_mem(0xC00C); a.ld_mem_a(0x8002)  # init high = C0
    # B: firmware minor version through the ports
    a.reg_read(base, 0xC4); a.ld_mem_a(0x8003)
    # C: fast RAM paging keeps contents per page
    a.reg_write(base, 0xB0, 2)
    a.ld_a(0xAA); a.ld_mem_a(0x8100)
    a.reg_write(base, 0xB0, 4)
    a.ld_a_mem(0x8100); a.ld_mem_a(0x8004)  # 00 (page 4 untouched)
    a.reg_write(base, 0xB0, 2)
    a.ld_a_mem(0x8100); a.ld_b_a()
    a.reg_write(base, 0xB0, 4)
    a.ld_a_b(); a.ld_mem_a(0x8005)          # AA
    # D: $FF = the TVC's own RAM becomes visible again
    a.reg_write(base, 0xB0, 0xFF)
    a.ld_a(0x55); a.ld_mem_a(0x8200)
    a.ld_a_mem(0x8200); a.ld_b_a()
    a.reg_write(base, 0xB0, 4)
    a.ld_a_b(); a.ld_mem_a(0x8006)          # 55
    a.ld_a_mem(0x8200); a.ld_mem_a(0x8007)  # 00
    # E: PSRAM page 0x102 (needs the high bit), write-back and reload
    a.reg_write(base, 0xB3, 1); a.reg_write(base, 0xB2, 2)
    a.reg_read(base, 0xB0); a.ld_b_a()      # 10
    a.ld_a(0xDE); a.ld_mem_a(0x8300); a.ld_mem_a(0xBFFF)
    a.reg_write(base, 0xB3, 0); a.reg_write(base, 0xB2, 3)
    a.ld_a_mem(0x8300); a.ld_c_a()          # 00 (a different page)
    a.reg_write(base, 0xB3, 1); a.reg_write(base, 0xB2, 2)
    a.ld_a_mem(0x8300); a.ld_d_a(); a.ld_a_mem(0xBFFF); a.ld_e_a()   # DE DE
    a.reg_write(base, 0xB0, 4)
    a.ld_a_b(); a.ld_mem_a(0x8008)
    a.ld_a_c(); a.ld_mem_a(0x8009)
    a.ld_a_d(); a.ld_mem_a(0x800A)
    a.ld_a_e(); a.ld_mem_a(0x800B)
    # F: U3 (P3) is card fast page 5 / own RAM with $FF
    a.ld_a(0xA0); a.out(0x02)               # P2 = U2, P3 = U3
    a.ld_a(0x77); a.ld_mem_a(0xC010)
    a.ld_a_mem(0xC010); a.ld_mem_a(0x800C)  # 77
    a.reg_write(base, 0xB1, 0xFF)
    a.ld_a(0x33); a.ld_mem_a(0xC010)
    a.ld_a_mem(0xC010); a.ld_mem_a(0x800D)  # 33
    a.reg_write(base, 0xB1, 5)
    a.ld_a_mem(0xC010); a.ld_mem_a(0x800E)  # 77 again
    a.ld_a(0x42); a.ld_mem_a(0x800F)        # done
    a.halt_loop()
    return bytes(a.b).ljust(16384, b"\0")

def run(exe, rom, enabled, slot):
    with tempfile.NamedTemporaryFile(suffix=".rom", delete=False) as f:
        f.write(rom)
    out = subprocess.check_output([exe, f.name, str(enabled), str(slot)]).decode()
    os.unlink(f.name)
    pc = int(out.split()[0][3:], 16)
    mem = [int(x, 16) for x in out.split("\n")[1].split()]
    return pc, mem

def card_repo_files(repo):
    """Unpacks the flash image and a sample file from a clone of
    https://github.com/dikdom/tvc256kplusplus (binaries/flash-root-*.zip)."""
    import glob, zipfile
    out = os.path.join(OBJ, "cardrepo")
    os.makedirs(out, exist_ok=True)
    img = [z for z in glob.glob(os.path.join(repo, "binaries", "flash-root-*-bin.zip"))]
    fil = [z for z in glob.glob(os.path.join(repo, "binaries", "flash-root-*-files.zip"))]
    if not img or not fil:
        return None
    zipfile.ZipFile(sorted(img)[-1]).extractall(out)
    zipfile.ZipFile(sorted(fil)[-1]).extractall(out)
    bins = glob.glob(os.path.join(out, "flash-root-*.bin"))
    return bins[0], os.path.join(out, "flash-root", "launcher.cas")

def compile_objs(sources, prefix):
    objs = []
    for src in sources:
        cc = ["gcc", "-std=gnu11"] if src.endswith(".c") else ["g++", "-std=gnu++17"]
        o = os.path.join(OBJ, prefix + src.replace("/", "_") + ".o")
        if not os.path.exists(o) or os.path.getmtime(o) < os.path.getmtime(os.path.join(ROOT, src)):
            subprocess.check_call(cc + ["-O1", "-w", "-I" + os.path.join(ROOT, "web/src"), "-c", os.path.join(ROOT, src), "-o", o])
        objs.append(o)
    return objs

VENDORED = ["web/src/card/tvc-lfs.c", "web/src/card/littlefs/lfs.c", "web/src/card/littlefs/lfs_util.c",
            "web/src/card/tvc-graphics.c", "web/src/card/tvc-routines.c", "web/src/card/tvc-io-regs.c",
            "web/src/card/tvc-card-data.c", "web/src/card/zx7Compress.c",
            "web/src/tvc256kpp_fs.cpp"]

def unit_checks():
    """Card model on its own (test/card_test.cpp): ports, registers, paging, ROM."""
    objs = compile_objs(VENDORED + ["web/src/tvc256kpp.cpp", "web/src/tvc256kpp_rom.cpp", "test/card_test.cpp"], "unit_")
    exe = os.path.join(OBJ, "card_test")
    subprocess.check_call(["g++"] + objs + ["-o", exe])
    r = subprocess.run([exe], stdout=subprocess.PIPE, universal_newlines=True)
    print("unit: " + r.stdout.strip().splitlines()[-1])
    return 0 if r.returncode == 0 else 1

def fs_checks(repo):
    """Card file system without any Z80 code (test/card_fs_test.cpp)."""
    files = card_repo_files(repo)
    if not files:
        print("fs: SKIPPED (no flash image found in %s)" % repo)
        return 0
    objs = compile_objs(VENDORED + ["test/card_fs_test.cpp"], "fs_")
    exe = os.path.join(OBJ, "card_fs_test")
    subprocess.check_call(["g++"] + objs + ["-o", exe])
    r = subprocess.run([exe, files[0], files[1]], stdout=subprocess.PIPE, universal_newlines=True)
    print("fs: %s" % r.stdout.strip().splitlines()[-1] if r.stdout.strip() else "fs: no output")
    return 0 if r.returncode == 0 else 1

def boot_checks(pkg, repo=None):
    # real TVC BASIC 2.2 ROMs (from the ep128emu ROM package) with the card in slot 2
    exe = build("test/native_boot.cpp", "boot_harness")
    def boot(enabled, text=None, flash=None):
        env = dict(os.environ)
        if flash:
            env["CARD_FLASH"] = flash
        cmd = [exe, pkg, str(enabled), "12", os.path.join(OBJ, "boot.ppm"), "2", "4"]
        if text:
            cmd.append(text)
            env["WAIT_AFTER"] = "10"
        return subprocess.check_output(cmd, env=env).decode()
    bad = 0
    on, off = boot(1), boot(0)
    mem = {}
    for line in on.splitlines():
        if len(line) > 5 and line[4] == ":":
            mem[int(line[:4], 16)] = [int(x, 16) for x in line[5:].split()]
    checks = [
        ("TVC OS reads the card header ('256k++' in the slot 2 buffer)",
         mem[0xA0][:7] == [6, 0x32, 0x35, 0x36, 0x6B, 0x2B, 0x2B]),
        ("card init ran (base port $30 stored)", mem[0xA0][8] == 0x30),
        ("card installed the EXT 2 vector and jump code", "b0 00" in on and mem[0xB0][0] == 0xF5),
        ("cassette redirect points at slot 2", "redirect in/out=82/82" in on),
        ("without the card: FILE: keeps slot 1, no EXT vectors",
         "redirect in/out=81/81" in off and "00 00 00 00 00 00 00 00" in off),
    ]
    files = card_repo_files(repo) if repo else None
    if files:
        # LOAD "aircraft" from the flash drive through the card ROM, then RUN
        out = boot(1, 'ext 2\ncd games\nx\nload "aircraft"\nrun\n', files[0])
        opens = int(out.split("fs opens=")[1].split()[0])
        nbytes = int(out.split("bytes=")[1].split()[0])
        checks.append(("LOAD from the flash drive opens a file and reads it (>= 8000 bytes)", opens >= 1 and nbytes >= 8000))
    for name, ok in checks:
        print("boot: %s: %s" % (name, "OK" if ok else "FAIL"))
        bad += 0 if ok else 1
    return bad

def main():
    exe = build()
    want = [0x4D, 0x2E, 0xC0, 24, 0, 0xAA, 0x55, 0, 0x10, 0, 0xDE, 0xDE,
            0x77, 0x33, 0x77, 0x42]
    bad = 0
    for slot in (1, 2, 3):
        pc, mem = run(exe, program(slot), 1, slot)
        ok = mem == want
        print("slot %d: pc=%04x %s" % (slot, pc, "OK" if ok else "FAIL"))
        if not ok:
            bad += 1
            print("  got ", " ".join("%02x" % x for x in mem))
            print("  want", " ".join("%02x" % x for x in want))
    # card disabled: ordinary TVC behaviour, no card ROM in the slot
    pc, mem = run(exe, program(1), 0, 1)
    ok = mem[15] == 0x42 and mem[0] != 0x4D and mem[3] != 24
    print("card off: %s (mem %s)" % ("OK" if ok else "FAIL", " ".join("%02x" % x for x in mem)))
    bad += 0 if ok else 1
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--roms", help="ep128emu_roms-*.bin: also boots the real TVC BASIC with the card")
    ap.add_argument("--card-repo", default=os.path.join(os.path.dirname(ROOT), "tvc256kplusplus"),
                    help="clone of dikdom/tvc256kplusplus (flash image for the file system tests)")
    args = ap.parse_args()
    repo = args.card_repo if os.path.isdir(args.card_repo) else None
    bad += unit_checks()
    if repo:
        bad += fs_checks(repo)
    else:
        print("fs: SKIPPED (no --card-repo)")
    if args.roms:
        bad += boot_checks(args.roms, repo)
    sys.exit(1 if bad else 0)

if __name__ == "__main__":
    main()
