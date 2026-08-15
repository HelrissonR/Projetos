# Ferramentas de build/assinatura

> Visão geral do projeto, regras de domínio e armadilhas conhecidas:
> **[`../HANDOFF.md`](../HANDOFF.md)**. Leia antes de mexer no app.

O app Bolsa Família é um WebView cujo código roda inteiramente em
`app/assets/index.html` (empacotado dentro do APK em `assets/index.html`).

## Como reempacotar e assinar o APK

```
# 1. extrair o APK de referência (uma vez)
mkdir extracted && (cd extracted && unzip -q ../Gestor-Bolsa-Familia-Saude.apk)

# 2. atualizar o app
cp app/assets/index.html extracted/assets/index.html
rm -rf extracted/META-INF          # a assinatura recria

# 3. reempacotar preservando compressão e alinhamento
python3 tools/empacotar.py extracted referencia.apk unsigned.apk

# 4. assinar
javac -cp apksig.jar tools/SignKS.java -d .
java -cp .:apksig.jar \
  -Dks=bolsafamilia-release.jks -Dpw='<senha>' -Dalias=bolsafamilia \
  -Din=unsigned.apk -Dout=Gestor-Bolsa-Familia-Saude.apk SignKS
```

### Não use `zip` para reempacotar

O `zip -r` comprime tudo, e isso **quebra a instalação**. O APK guarda
`resources.arsc` e os PNGs de ícone sem compressão, e desde o Android 11 um app
que mira `targetSdkVersion >= 30` (este mira 34) é recusado na instalação se o
`resources.arsc` estiver comprimido — o erro é
`INSTALL_PARSE_FAILED_RESOURCES_ARSC_COMPRESSED`.

`empacotar.py` resolve isso: copia de um APK de referência o método de
compressão de cada entrada e alinha em 4 bytes o início dos dados das entradas
guardadas cruas, que é o que o `zipalign` faria. Ele mesmo confere o resultado e
falha se algo não bater.

## Como mudar o nome que aparece sob o ícone

O `android:label` do manifesto é a referência `@0x7f0d001c`, então o texto mora
no pool de strings do `resources.arsc`, que é binário.

```
python3 tools/renomear_app.py extracted/resources.arsc "Novo Nome"
```

O script resolve o id de recurso até a string antes de escrever (se não
resolver, ele para), recalcula os offsets seguintes e os tamanhos dos chunks, e
relê o arquivo conferindo que só aquela string mudou. Guarda um `.bak` ao lado.

Nome atual: **Gestor Bolsa Família saúde**.

## Assinatura

O APK é assinado com `bolsafamilia-release.jks` (alias `bolsafamilia`), a chave
de produção. Manter essa chave é o que permite atualizar o app por cima; se ela
mudar, o Android exige desinstalar antes. Ela **não** fica no repositório.

`Sign.java` é a versão antiga, com keystore fixo no código; use `SignKS.java`,
que recebe keystore, senha e alias por propriedade de sistema.
