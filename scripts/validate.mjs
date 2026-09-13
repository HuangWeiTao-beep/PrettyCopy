import { access, readFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
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
assert(!manifest.content_scripts, "通用面板版不应再注入网页脚本");
assert(!manifest.host_permissions, "通用面板版不需要网站访问权限");

const popupRelativePath = manifest.action?.default_popup;
assert(Boolean(popupRelativePath), "扩展图标必须配置弹出面板");

let popupHtml = "";
try {
  popupHtml = await readFile(join(root, popupRelativePath), "utf8");
} catch {
  failures.push(`弹出面板不存在：${popupRelativePath}`);
}

const popupDirectory = dirname(join(root, popupRelativePath || "popup/popup.html"));
const localReferences = [
  ...popupHtml.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/gi)
].map((match) => normalize(join(popupDirectory, match[1])));

for (const filePath of localReferences) {
  try {
    await access(filePath);
  } catch {
    failures.push(`面板引用的文件不存在：${filePath}`);
  }
}

for (const relativePath of ["src/source-formatter.js", "popup/popup.js"]) {
  try {
    new Script(await readFile(join(root, relativePath), "utf8"), { filename: relativePath });
  } catch (error) {
    failures.push(`${relativePath} 语法错误：${error.message}`);
  }
}

assert(!/<script(?![^>]*\bsrc=)/i.test(popupHtml), "弹窗不能使用内联脚本（Manifest V3 CSP）");
assert(/<meta name="viewport"/i.test(popupHtml), "弹窗缺少 viewport 声明");
assert(/id="source-text"/i.test(popupHtml), "弹窗缺少原文本输入区");
assert(/id="output-frame"/i.test(popupHtml), "弹窗缺少目标文本输出区");
assert(/id="copy-button"/i.test(popupHtml), "弹窗缺少一键复制按钮");
assert(/aria-live="polite"/i.test(popupHtml), "复制状态需要可访问的实时提示");
assert([...popupHtml.matchAll(/name="defaultMode"/g)].length === 3, "弹窗必须提供三种转换模式");

if (failures.length) {
  console.error(`PrettyCopy 检查失败（${failures.length} 项）：`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("PrettyCopy 检查通过：独立弹出面板、2 个脚本、最小权限与可访问性基础项均正常。");
}
