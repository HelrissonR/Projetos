import com.android.apksig.ApkSigner;
import java.io.*;
import java.security.*;
import java.security.cert.X509Certificate;
import java.util.*;

public class Sign {
  public static void main(String[] a) throws Exception {
    char[] pw = "bolsafamilia".toCharArray();
    KeyStore ks = KeyStore.getInstance("PKCS12".equals(System.getProperty("kt"))?"PKCS12":"JKS");
    try (FileInputStream f = new FileInputStream("bf.keystore")) { ks.load(f, pw); }
    PrivateKey key = (PrivateKey) ks.getKey("bf", pw);
    java.security.cert.Certificate[] chain = ks.getCertificateChain("bf");
    List<X509Certificate> certs = new ArrayList<>();
    for (java.security.cert.Certificate c : chain) certs.add((X509Certificate) c);
    ApkSigner.SignerConfig cfg = new ApkSigner.SignerConfig.Builder("CERT", key, certs).build();
    ApkSigner signer = new ApkSigner.Builder(Collections.singletonList(cfg))
        .setInputApk(new File("unsigned.apk"))
        .setOutputApk(new File("BolsaFamilia-signed.apk"))
        .setV1SigningEnabled(true)
        .setV2SigningEnabled(true)
        .build();
    signer.sign();
    System.out.println("SIGNED OK");
  }
}
