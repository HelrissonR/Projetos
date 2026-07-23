# Ferramentas de build/assinatura

O app Bolsa Família é um WebView cujo código roda inteiramente em
`app/assets/index.html` (empacotado dentro do APK em `assets/index.html`).

## Como reempacotar e assinar o APK

1. Substitua `assets/index.html` dentro de uma cópia do APK original:
   ```
   cp original.apk unsigned.apk
   (cd app && zip -q ../unsigned.apk assets/index.html)
   zip -q -d unsigned.apk "META-INF/*.SF" "META-INF/*.RSA" "META-INF/*.DSA" "META-INF/MANIFEST.MF"
   ```
2. Gere um keystore (uma vez):
   ```
   keytool -genkeypair -keystore bf.keystore -alias bf -keyalg RSA -keysize 2048 \
     -validity 10000 -storepass bolsafamilia -keypass bolsafamilia \
     -dname "CN=Bolsa Familia, OU=App, O=App, L=BR, S=BR, C=BR"
   ```
3. Assine com `Sign.java` (usa a biblioteca `com.android.tools.build:apksig`
   do Google Maven — assina nos esquemas v1/v2/v3):
   ```
   javac -cp apksig.jar Sign.java
   java -cp .:apksig.jar Sign
   ```

> Observação: o APK é assinado com uma chave nova, diferente da chave
> original do desenvolvedor. Para instalar, desinstale a versão anterior
> antes (a atualização por cima exige a mesma chave de assinatura).
