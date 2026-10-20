#!/usr/bin/env python3
"""把已构建好的 tutor-admin.jar 里的 Windows 专属配置改写成本机可用的配置。

为什么要改 jar 而不仅是改源码：
  便携包交付的是「构建好的 jar」，而 logback.xml / application*.yml 是被打进
  BOOT-INF/classes/ 里的。只改源码而不重新构建，运行时的 jar 仍然带着
  E:\\home\\ruoyi\\logs、D:/ruoyi/uploadPath、8080 端口和 useSSL=true 的旧配置，
  在 Linux 上会出现：日志写到名字带反斜杠的怪文件、上传目录不存在、
  端口被占用起不来、连数据库 SSL 握手失败。
  本机没有 Maven（也不需要为了改几行配置去下一整套依赖），所以就地改包，
  原始 jar 保留为 .orig-win 备份。

脚本总是从 .orig-win 备份重新生成，因此可以反复执行而不会叠加改动。

用法: python3 patch-jar-config.py [jar路径]
"""
import os
import shutil
import sys
import zipfile

ROOT = "/home/ubuntu/PlatformE/tutor-platform"
DEFAULT_JAR = f"{ROOT}/tutor/tutor-admin/target/tutor-admin.jar"

# (jar 内的路径, 原文, 替换为, 说明)
REPLACEMENTS = [
    ("BOOT-INF/classes/application.yml",
     b"D:/ruoyi/uploadPath",
     f"{ROOT}/data/uploadPath".encode(),
     "上传目录 D:/ruoyi/uploadPath -> 项目内数据目录"),
    ("BOOT-INF/classes/application.yml",
     b"port: 8080",
     b"port: 12501",
     "后端端口 8080 -> 12501（8080 被平台 Caddy 占用；12501 是要对公网开放的端口）"),
    ("BOOT-INF/classes/application-druid.yml",
     b"useSSL=true&serverTimezone",
     b"useSSL=true&enabledTLSProtocols=TLSv1.2&serverTimezone",
     "JDBC 显式限定 TLSv1.2（MySQL 8.0.46 与 JDK8 默认 cipher 协商失败）"),
    ("BOOT-INF/classes/logback.xml",
     b"E:\\\\home\\\\ruoyi\\\\logs",
     f"{ROOT}/data/logs".encode(),
     "日志目录 E:\\home\\ruoyi\\logs -> 项目内 data/logs"),
]


def main():
    jar = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_JAR
    if not os.path.isfile(jar):
        print(f"找不到 {jar}")
        return 1

    backup = jar + ".orig-win"
    if not os.path.exists(backup):
        shutil.copy2(jar, backup)
        print(f"备份原始 jar -> {backup}")

    # 始终基于原始备份重做，保证幂等
    src = backup
    tmp = jar + ".new"
    hits = {i: 0 for i in range(len(REPLACEMENTS))}

    with zipfile.ZipFile(src) as zin, \
            zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            for idx, (name, old, new, _desc) in enumerate(REPLACEMENTS):
                if item.filename == name and old in data:
                    data = data.replace(old, new)
                    hits[idx] += 1
            # 保留原压缩方式与时间戳，避免 Spring Boot 启动器解析出意外差异
            zi = zipfile.ZipInfo(item.filename, date_time=item.date_time)
            zi.compress_type = item.compress_type
            zi.external_attr = item.external_attr
            zi.internal_attr = item.internal_attr
            zi.create_system = item.create_system
            zout.writestr(zi, data)

    rc = 0
    for idx, (_name, _old, _new, desc) in enumerate(REPLACEMENTS):
        if hits[idx]:
            print(f"  [改写] {desc}")
        else:
            print(f"  [警告] 未命中：{desc}")
            rc = 2

    os.replace(tmp, jar)
    print(f"完成：{jar}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
