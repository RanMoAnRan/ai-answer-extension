import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

cpSync('manifest.json', 'dist/manifest.json');
mkdirSync('dist/popup', { recursive: true });
mkdirSync('dist/options', { recursive: true });
cpSync('dist/src/popup/index.html', 'dist/popup/index.html');
cpSync('dist/src/options/index.html', 'dist/options/index.html');
for (const file of ['dist/popup/index.html', 'dist/options/index.html']) {
  let html = readFileSync(file, 'utf8');
  html = html.replaceAll('src="/assets/', 'src="../assets/');
  html = html.replaceAll('href="/assets/', 'href="../assets/');
  writeFileSync(file, html);
}
