import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifestPath = join(root, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(manifest.manifest_version === 3, "manifest.json 必须使用 Manifest V3");
assert(/^\d+\.\d+\.\d+$/.test(manifest.version), "版本号必须使用 x.y.z 格式");
assert(manifest.permissions.includes("clipboardWrite"), "缺少 clipboardWrite 权限");
assert(!manifest.permissions.includes("clipboardRead"), "不应申请 clipboardRead 权限");
assert(manifest.permissions.includes("storage"), "缺少 storage 权限");

const referencedFiles = [
  manifest.action?.default_popup,
  ...manifest.content_scripts.flatMap((entry) => [...(entry.js || []), ...(entry.css || [])])
].filter(Boolean);

for (const relativePath of referencedFiles) {
  try {
    await access(join(root, relativePath));
  } catch {
    failures.push(`清单引用的文件不存在：${relativePath}`);
  }
}

for (const relativePath of ["src/formatter.js", "src/content.js", "popup/popup.js"]) {
  try {
    new Script(await readFile(join(root, relativePath), "utf8"), { filename: relativePath });
  } catch (error) {
    failures.push(`${relativePath} 语法错误：${error.message}`);
  }
}

const popupHtml = await readFile(join(root, "popup/popup.html"), "utf8");
assert(!/<script(?![^>]*\bsrc=)/i.test(popupHtml), "弹窗不能使用内联脚本（Manifest V3 CSP）");
assert(/<meta name="viewport"/i.test(popupHtml), "弹窗缺少 viewport 声明");
assert(/aria-live="polite"/i.test(popupHtml), "保存状态需要可访问的实时提示");

if (failures.length) {
  console.error(`PrettyCopy 检查失败（${failures.length} 项）：`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`PrettyCopy 检查通过：${referencedFiles.length} 个清单文件、3 个脚本、最小权限与可访问性基础项均正常。`);
}
