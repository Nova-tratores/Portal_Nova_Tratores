import java.awt.image.ImageProducer;
import java.awt.image.PixelGrabber;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.nio.file.Files;
import javax.imageio.ImageIO;
import oic.generico.image.PcxImage;

// Converte TODOS os .PHF de uma pasta para .png, usando o decodificador original
// da OiC (oic_generico_image.jar) que acompanha o catálogo Valtra.
// Uso: java PhfLote <pastaEntrada> <pastaSaida>
public class PhfLote {
  static int u16(byte[] b, int o) { return (b[o] & 0xFF) | ((b[o + 1] & 0xFF) << 8); }

  static ImageProducer abrir(byte[] b) throws Exception {
    try {
      return new PcxImage().getImageProducer(new ByteArrayInputStream(b));
    } catch (Exception e) {
      byte[] c = b.clone();
      c[0] = 0x0A; // PHF traz 0xA0; PCX de verdade é 0x0A
      return new PcxImage().getImageProducer(new ByteArrayInputStream(c));
    }
  }

  public static void main(String[] args) throws Exception {
    File dirIn = new File(args[0]);
    File dirOut = new File(args[1]);
    dirOut.mkdirs();
    File[] fs = dirIn.listFiles((d, n) -> n.toUpperCase().endsWith(".PHF"));
    if (fs == null) { System.out.println("pasta vazia"); return; }
    java.util.Arrays.sort(fs);
    int ok = 0, erro = 0;
    StringBuilder falhas = new StringBuilder();
    for (File f : fs) {
      String base = f.getName().replaceAll("(?i)\\.phf$", "");
      File out = new File(dirOut, base + ".png");
      if (out.exists()) { ok++; continue; } // idempotente: re-rodar não refaz
      try {
        byte[] b = Files.readAllBytes(f.toPath());
        int w = u16(b, 8) - u16(b, 4) + 1;
        int h = u16(b, 10) - u16(b, 6) + 1;
        if (w <= 0 || h <= 0 || (long) w * h > 40_000_000L) throw new RuntimeException("dimensao invalida " + w + "x" + h);
        int[] px = new int[w * h];
        PixelGrabber pg = new PixelGrabber(abrir(b), 0, 0, w, h, px, 0, w);
        if (!pg.grabPixels()) throw new RuntimeException("grabPixels status " + pg.getStatus());
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        img.setRGB(0, 0, w, h, px, 0, w);
        ImageIO.write(img, "png", out);
        ok++;
      } catch (Throwable t) {
        erro++;
        falhas.append("  ").append(f.getName()).append(": ").append(t.getMessage()).append("\n");
      }
      if ((ok + erro) % 200 == 0) System.out.println("  " + (ok + erro) + "/" + fs.length + " (" + erro + " erros)");
    }
    System.out.println("\nOK: " + ok + " | erros: " + erro + " | total: " + fs.length);
    if (erro > 0) System.out.print("Falhas:\n" + falhas);
  }
}
