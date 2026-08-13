import com.android.apksig.ApkSigner;
import java.io.*; import java.security.*; import java.security.cert.X509Certificate; import java.util.*;
public class SignKS {
  public static void main(String[] a) throws Exception {
    String ks=System.getProperty("ks"), pw=System.getProperty("pw"), alias=System.getProperty("alias"),
           in=System.getProperty("in"), out=System.getProperty("out");
    char[] p=pw.toCharArray();
    KeyStore k=KeyStore.getInstance(ks.endsWith(".jks")?"JKS":"PKCS12");
    try(FileInputStream f=new FileInputStream(ks)){k.load(f,p);}
    PrivateKey key=(PrivateKey)k.getKey(alias,p);
    List<X509Certificate> certs=new ArrayList<>();
    for(java.security.cert.Certificate c:k.getCertificateChain(alias)) certs.add((X509Certificate)c);
    ApkSigner.SignerConfig cfg=new ApkSigner.SignerConfig.Builder("CERT",key,certs).build();
    new ApkSigner.Builder(Collections.singletonList(cfg))
      .setInputApk(new File(in)).setOutputApk(new File(out))
      .setV1SigningEnabled(true).setV2SigningEnabled(true).setV3SigningEnabled(true).build().sign();
    System.out.println("SIGNED "+out);
  }
}
