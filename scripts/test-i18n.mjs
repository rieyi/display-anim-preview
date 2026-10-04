import { importTestBundle } from "./lib/test-bundle.mjs";
import { fileURLToPath } from "node:url";

const i18nPath = fileURLToPath(new URL("../src/i18n.ts", import.meta.url));

async function runBuild(forcedLanguage, selectedLanguage) {
  const entry = `
    const translations = {};
    globalThis.Language = {
      addTranslations(language, values) {
        translations[language] = values;
      }
    };
    globalThis.tl = key => translations[${JSON.stringify(selectedLanguage)}]?.[key] ?? key;
    const i18n = await import(${JSON.stringify(i18nPath)});
    i18n.registerTranslations();
    globalThis.__I18N_RESULT__ = {
      title: i18n.tr("dap.export.complete"),
      projectName: i18n.tr("dap.export.project_name"),
      insert: i18n.tr("dap.export.write_mode.insert"),
      conflict: i18n.tr("dap.export.conflict_title"),
      warning: i18n.tr("dap.export.resampled_message", {
        source_fps: 10,
        game_fps: 12,
        frames: 13
      }),
      forced: i18n.isChineseOnlyBuild(),
      keySetsMatch: JSON.stringify(Object.keys(translations.en ?? {}).sort()) === JSON.stringify(Object.keys(translations.zh ?? {}).sort())
    };
  `;
  await importTestBundle(entry, { sourcefile: "i18n-test.ts", define: { __DAP_FORCE_LANGUAGE__: forcedLanguage, } });
  return globalThis.__I18N_RESULT__;
}

const universalChinese = await runBuild("null", "zh");
if (universalChinese.title !== "导出完成" || universalChinese.forced) {
  throw new Error("universal build did not follow the selected Blockbench language");
}

const forcedChinese = await runBuild('"zh"', "en");
if (forcedChinese.title !== "导出完成" || !forcedChinese.forced) {
  throw new Error("Simplified Chinese build did not override the Blockbench language");
}
if (!forcedChinese.warning.includes("10 FPS") || !forcedChinese.warning.includes("12 FPS") || !forcedChinese.warning.includes("13 帧")) {
  throw new Error("Simplified Chinese replacement text was not rendered correctly");
}
if (forcedChinese.projectName !== "项目名" || forcedChinese.insert !== "插入现有包" || forcedChinese.conflict !== "路径冲突") {
  throw new Error("JSB integration export translations are missing");
}
if (!forcedChinese.keySetsMatch) {
  throw new Error("English and Chinese translation key sets differ");
}

process.stdout.write(JSON.stringify({ universalChinese, forcedChinese }));
