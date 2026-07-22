import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.File;
import javax.imageio.*;
import javax.imageio.stream.ImageOutputStream;
import java.util.Iterator;

// Gera miniaturas (JPEG, largura fixa, fundo branco) a partir dos PNGs do catálogo.
// Uso: java Thumbs <pastaEntrada> <pastaSaida> <larguraMax>
public class Thumbs {
  static void gravarJpeg(BufferedImage img, File out, float q) throws Exception {
    Iterator<ImageWriter> it = ImageIO.getImageWritersByFormatName("jpeg");
    ImageWriter w = it.next();
    ImageWriteParam p = w.getDefaultWriteParam();
    p.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
    p.setCompressionQuality(q);
    try (ImageOutputStream os = ImageIO.createImageOutputStream(out)) {
      w.setOutput(os);
      w.write(null, new IIOImage(img, null, null), p);
    }
    w.dispose();
  }

  public static void main(String[] a) throws Exception {
    File dirIn = new File(a[0]), dirOut = new File(a[1]);
    int LARG = Integer.parseInt(a[2]);
    dirOut.mkdirs();
    File[] fs = dirIn.listFiles((d, n) -> n.toLowerCase().endsWith(".png"));
    if (fs == null) { System.out.println("vazio"); return; }
    java.util.Arrays.sort(fs);
    int ok = 0, erro = 0;
    long bytes = 0;
    for (File f : fs) {
      File out = new File(dirOut, f.getName().replaceAll("(?i)\\.png$", ".jpg"));
      if (out.exists()) { ok++; bytes += out.length(); continue; }
      try {
        BufferedImage src = ImageIO.read(f);
        int w = src.getWidth(), h = src.getHeight();
        double esc = Math.min(1.0, (double) LARG / w);
        int nw = Math.max(1, (int) Math.round(w * esc)), nh = Math.max(1, (int) Math.round(h * esc));
        BufferedImage dst = new BufferedImage(nw, nh, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = dst.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, nw, nh);
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.drawImage(src.getScaledInstance(nw, nh, Image.SCALE_SMOOTH), 0, 0, null);
        g.dispose();
        gravarJpeg(dst, out, 0.72f);
        bytes += out.length();
        ok++;
      } catch (Throwable t) { erro++; }
      if ((ok + erro) % 300 == 0) System.out.println("  " + (ok + erro) + "/" + fs.length);
    }
    System.out.printf("%nOK %d | erros %d | media %d KB%n", ok, erro, ok > 0 ? bytes / ok / 1024 : 0);
  }
}
