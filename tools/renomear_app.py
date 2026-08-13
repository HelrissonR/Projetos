#!/usr/bin/env python3
"""Troca o nome do app (android:label) dentro do resources.arsc.

O label do manifesto é a referência @0x7f0d001c, então o texto mora no pool
global de strings do resources.arsc. Trocá-lo por um texto mais longo obriga a
recalcular todos os offsets seguintes e os tamanhos dos chunks que o contêm.

Uso: renomear_app.py <resources.arsc> "<novo nome>" [--id 0x7f0d001c]
"""
import struct, sys, shutil

RES_TABLE, RES_STRING_POOL, RES_TABLE_PACKAGE = 0x0002, 0x0001, 0x0200
RES_TABLE_TYPE, RES_TABLE_TYPE_SPEC = 0x0201, 0x0202


def ler_pool(d, base):
    t, hs, sz = struct.unpack_from('<HHI', d, base)
    assert t == RES_STRING_POOL, f'esperava um pool em {base}, achei 0x{t:x}'
    cnt, sty, flags, str_start, sty_start = struct.unpack_from('<IIIII', d, base + 8)
    offs = list(struct.unpack_from('<%dI' % cnt, d, base + hs))
    utf8 = bool(flags & 0x100)
    return dict(base=base, hs=hs, sz=sz, cnt=cnt, sty=sty, flags=flags,
                str_start=str_start, sty_start=sty_start, offs=offs, utf8=utf8)


def str_em(d, p, i):
    o = p['base'] + p['str_start'] + p['offs'][i]
    if p['utf8']:
        n16 = d[o]; o += 2 if n16 < 0x80 else 3
        # o comprimento em bytes vem logo depois do comprimento em caracteres
        o = p['base'] + p['str_start'] + p['offs'][i]
        a = 1 if d[o] < 0x80 else 2
        b = 1 if d[o + a] < 0x80 else 2
        nb = d[o + a] if b == 1 else ((d[o + a] & 0x7f) << 8) | d[o + a + 1]
        ini = o + a + b
        return d[ini:ini + nb].decode('utf-8')
    n = struct.unpack_from('<H', d, o)[0]
    return d[o + 2:o + 2 + n * 2].decode('utf-16-le')


def entrada_utf8(txt):
    """Codifica uma entrada do pool UTF-8: [nchars][nbytes][bytes][00]."""
    b = txt.encode('utf-8')
    if len(txt) > 0x7f or len(b) > 0x7f:
        raise SystemExit('nome longo demais para a codificação curta do pool')
    return bytes([len(txt), len(b)]) + b + b'\x00'


def resolver_label(d, id_alvo):
    """Segue o id de recurso até o índice de string no pool global.

    Devolve o índice, ou None se não achar — assim o script para em vez de
    escrever no escuro."""
    pkg_id, type_id, entry_id = (id_alvo >> 24) & 0xff, (id_alvo >> 16) & 0xff, id_alvo & 0xffff
    t, hs, sz = struct.unpack_from('<HHI', d, 0)
    pool = ler_pool(d, hs)
    o = hs + pool['sz']
    while o < len(d) - 8:
        ct, chs, csz = struct.unpack_from('<HHI', d, o)
        if ct == RES_TABLE_PACKAGE:
            pid = struct.unpack_from('<I', d, o + 8)[0]
            if pid == pkg_id:
                p = o + chs
                while p < o + csz - 8:
                    tt, ths, tsz = struct.unpack_from('<HHI', d, p)
                    if tt == RES_TABLE_TYPE:
                        tid = d[p + 8]
                        ecount, estart = struct.unpack_from('<II', d, p + 12)
                        if tid == type_id and entry_id < ecount:
                            eoff = struct.unpack_from('<I', d, p + ths + entry_id * 4)[0]
                            if eoff != 0xFFFFFFFF:
                                e = p + estart + eoff
                                esz, eflags = struct.unpack_from('<HH', d, e)
                                if not (eflags & 0x0001):        # não é mapa/bag
                                    v = e + esz
                                    dtype = d[v + 3]
                                    data = struct.unpack_from('<I', d, v + 4)[0]
                                    if dtype == 0x03:            # TYPE_STRING
                                        return data
                    if tsz <= 0: break
                    p += tsz
        if csz <= 0: break
        o += csz
    return None


def main():
    caminho, novo = sys.argv[1], sys.argv[2]
    id_alvo = int(sys.argv[4], 16) if len(sys.argv) > 4 and sys.argv[3] == '--id' else 0x7f0d001c
    d = bytearray(open(caminho, 'rb').read())

    t, hs, tsize = struct.unpack_from('<HHI', d, 0)
    assert t == RES_TABLE, 'não parece um resources.arsc'
    assert tsize == len(d), f'tamanho declarado {tsize} != arquivo {len(d)}'
    p = ler_pool(d, hs)
    assert p['utf8'], 'este script só trata pool UTF-8'
    assert p['sty'] == 0, 'há estilos no pool; seria preciso corrigir o vetor deles também'

    idx = resolver_label(d, id_alvo)
    if idx is None:
        raise SystemExit(f'não consegui resolver 0x{id_alvo:08x} até uma string — nada foi gravado')
    antes = [str_em(d, p, i) for i in range(p['cnt'])]
    print(f'label 0x{id_alvo:08x} -> string #{idx} = {antes[idx]!r}')
    if antes[idx] == novo:
        print('já está com o nome pedido; nada a fazer'); return

    # recompõe o bloco de dados das strings inteiro, com a entrada trocada
    dados_ini = p['base'] + p['str_start']
    fim_dados = p['base'] + (p['sty_start'] if p['sty_start'] else p['sz'])
    novas, offs = bytearray(), []
    for i in range(p['cnt']):
        offs.append(len(novas))
        if i == idx:
            novas += entrada_utf8(novo)
        else:
            o = dados_ini + p['offs'][i]
            fim = dados_ini + (p['offs'][i + 1] if i + 1 < p['cnt'] else (fim_dados - dados_ini))
            novas += d[o:fim]
    while len(novas) % 4:            # o chunk precisa continuar múltiplo de 4
        novas += b'\x00'

    novo_sz = p['hs'] + p['cnt'] * 4 + len(novas)
    delta = novo_sz - p['sz']
    saida = bytearray()
    saida += d[:p['base']]
    cab = bytearray(d[p['base']:p['base'] + p['hs']])
    struct.pack_into('<I', cab, 4, novo_sz)          # size do chunk do pool
    saida += cab
    saida += struct.pack('<%dI' % p['cnt'], *offs)
    saida += novas
    saida += d[p['base'] + p['sz']:]                 # pacotes, intocados
    struct.pack_into('<I', saida, 4, len(saida))     # size do RES_TABLE

    shutil.copyfile(caminho, caminho + '.bak')
    open(caminho, 'wb').write(saida)
    print(f'gravado: {len(d)} -> {len(saida)} bytes (delta {delta:+d})')

    # confere releitura
    d2 = bytearray(open(caminho, 'rb').read())
    p2 = ler_pool(d2, hs)
    depois = [str_em(d2, p2, i) for i in range(p2['cnt'])]
    assert p2['cnt'] == p['cnt'], 'perdi strings no caminho'
    assert depois[idx] == novo, 'a string 0 não ficou com o nome pedido'
    difs = [i for i in range(len(antes)) if antes[i] != depois[i]]
    assert difs == [idx], f'strings alteradas por engano: {difs}'
    assert struct.unpack_from('<I', d2, 4)[0] == len(d2), 'size do RES_TABLE errado'
    ct, chs, csz = struct.unpack_from('<HHI', d2, hs + p2['sz'])
    assert ct == RES_TABLE_PACKAGE, f'o chunk de pacote não sobreviveu (0x{ct:x})'
    assert resolver_label(d2, id_alvo) == idx, 'o label deixou de resolver'
    print(f'conferido: {p2["cnt"]} strings, só a #{idx} mudou, pacote íntegro')


if __name__ == '__main__':
    main()
