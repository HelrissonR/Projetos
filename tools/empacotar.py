#!/usr/bin/env python3
"""Reempacota o APK preservando compressão e alinhamento.

Por que não `zip -r -X`: ele comprime tudo. O APK original guarda
resources.arsc e os PNGs sem compressão, e desde o Android 11 um app que mira
SDK >= 30 é RECUSADO na instalação se o resources.arsc estiver comprimido
(INSTALL_PARSE_FAILED_RESOURCES_ARSC_COMPRESSED). Este script copia, entrada por
entrada, o método que ela tinha no APK de referência, e alinha em 4 bytes o
início dos dados das entradas guardadas cruas — o mesmo que o zipalign faz.

Uso: empacotar.py <pasta> <referencia.apk> <saida.apk>
"""
import os, sys, zipfile, struct

ALINHAMENTO = 4


def metodos_da_referencia(ref):
    with zipfile.ZipFile(ref) as z:
        return {i.filename: i.compress_type for i in z.infolist()}


def main():
    pasta, ref, saida = sys.argv[1], sys.argv[2], sys.argv[3]
    metodos = metodos_da_referencia(ref)

    arquivos = []
    for raiz, _, nomes in os.walk(pasta):
        for n in nomes:
            caminho = os.path.join(raiz, n)
            rel = os.path.relpath(caminho, pasta).replace(os.sep, '/')
            if rel.startswith('META-INF/'):      # a assinatura recria
                continue
            if rel.endswith('.bak'):             # backup do patch do arsc
                continue
            arquivos.append((rel, caminho))
    arquivos.sort()

    novos, stored = [], 0
    with zipfile.ZipFile(saida, 'w') as z:
        for rel, caminho in arquivos:
            met = metodos.get(rel)
            if met is None:
                met = zipfile.ZIP_DEFLATED       # entrada nova: comprime
                novos.append(rel)
            zi = zipfile.ZipInfo(rel, date_time=(2026, 1, 1, 0, 0, 0))
            zi.compress_type = met
            zi.external_attr = 0o644 << 16
            if met == zipfile.ZIP_STORED:
                stored += 1
                # alinha o início dos dados: cabeçalho local = 30 + nome + extra
                pos = z.fp.tell()
                sobra = (pos + 30 + len(rel.encode())) % ALINHAMENTO
                if sobra:
                    zi.extra = b'\x00' * (ALINHAMENTO - sobra)
            z.writestr(zi, open(caminho, 'rb').read())

    print(f'{len(arquivos)} entradas, {stored} sem compressão')
    if novos:
        print('entradas novas (comprimidas):', ', '.join(novos))
    conferir(saida, metodos)


def conferir(apk, metodos):
    """Relê o zip: método por entrada e alinhamento das entradas cruas."""
    d = open(apk, 'rb').read()
    problemas = []
    with zipfile.ZipFile(apk) as z:
        for i in z.infolist():
            esperado = metodos.get(i.filename)
            if esperado is not None and i.compress_type != esperado:
                problemas.append(f'{i.filename}: método {i.compress_type} != {esperado}')
            if i.compress_type == zipfile.ZIP_STORED:
                lh = i.header_offset
                nlen, elen = struct.unpack_from('<HH', d, lh + 26)
                ini = lh + 30 + nlen + elen
                if ini % ALINHAMENTO:
                    problemas.append(f'{i.filename}: dados em {ini}, não múltiplo de {ALINHAMENTO}')
    if problemas:
        print('PROBLEMAS:'); [print(' -', p) for p in problemas[:20]]
        raise SystemExit(1)
    print('conferido: métodos batem com a referência e entradas cruas alinhadas')


if __name__ == '__main__':
    main()
