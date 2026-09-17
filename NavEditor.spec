# -*- mode: python ; coding: utf-8 -*-
import os


a = Analysis(
    ['launcher.py'],
    pathex=[],
    binaries=[],
    datas=[('app_icon.ico', '.')],
    hiddenimports=['paramiko', 'cryptography', 'bcrypt', 'nacl', 'pyasn1'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='NavEditor',
    # 打包成品直接输出到「软件」文件夹（与源码分离；SPECPATH 为本 spec 所在目录）
    distpath=os.path.abspath(os.path.join(SPECPATH, '..', '软件')),
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    icon=os.path.abspath('app_icon.ico'),
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
