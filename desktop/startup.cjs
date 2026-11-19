function startupOptions(app){return {name:app.getName(),path:process.env.PORTABLE_EXECUTABLE_FILE||process.execPath,args:app.isPackaged?['--startup']:[app.getAppPath(),'--startup']};}
function configureStartup(app,enabled){const options=startupOptions(app);app.setLoginItemSettings({...options,openAtLogin:!!enabled});return options;}
module.exports={startupOptions,configureStartup};
