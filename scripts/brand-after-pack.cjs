// Apply the icon and Windows file metadata locally during packaging.
const fs = require('node:fs/promises');
const path = require('node:path');
const ResEdit = require('resedit');

module.exports = async context => {
  if (context.electronPlatformName !== 'win32') return;
  const { appInfo, projectDir } = context.packager;
  const filename = appInfo.productFilename + '.exe';
  const file = path.join(context.appOutDir, filename);
  const exe = ResEdit.NtExecutable.from(await fs.readFile(file), { ignoreCert: true });
  const resources = ResEdit.NtExecutableResource.from(exe);
  const icons = ResEdit.Data.IconFile.from(await fs.readFile(path.join(projectDir, 'public/brand/app.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries);
  for (const group of groups.length ? groups : [{ id: 1, lang: 1033 }]) {
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(resources.entries, group.id, group.lang, icons.icons.map(icon => icon.data));
  }

  const version = appInfo.getVersionInWeirdWindowsForm();
  for (const info of ResEdit.Resource.VersionInfo.fromEntries(resources.entries)) {
    info.setFileVersion(version);
    info.setProductVersion(version);
    for (const language of info.getAllLanguagesForStringValues()) {
      info.setStringValues(language, {
        FileDescription: appInfo.productName,
        ProductName: appInfo.productName,
        InternalName: appInfo.productFilename,
        OriginalFilename: filename,
        CompanyName: appInfo.companyName || '',
        LegalCopyright: appInfo.copyright,
      });
    }
    info.outputToResourceEntries(resources.entries);
  }

  resources.outputResource(exe);
  await fs.writeFile(file, Buffer.from(exe.generate()));
  console.log('Applied Soundboard Studio icon and Windows file metadata');
};
