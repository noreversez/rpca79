function doGet() {
  return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('RPCA79 - ระบบทดลองเลือกตำแหน่ง')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Config
  const configSheet = ss.getSheetByName('Config');
  const currentQueue = configSheet.getRange("B2").getDisplayValue();
  const systemStatus = configSheet.getRange("B3").getValue();
  const announcement = configSheet.getRange("B5").getDisplayValue();

  // 2. Users
  const uSheet = ss.getSheetByName('Users');
  const uData = uSheet.getDataRange().getDisplayValues(); 
  const users = uData.length > 1 ? uData.slice(1) : [];

  // 3. Positions
  const pSheet = ss.getSheetByName('Positions');
  const pData = pSheet.getDataRange().getDisplayValues();
  const positions = pData.length > 1 ? pData.slice(1) : [];

  // 4. Logs
  const lSheet = ss.getSheetByName('Logs');
  const lastRow = lSheet.getLastRow();
  let recentLogs = [];
  
  if (lastRow > 1) {
    const numToFetch = Math.min(50, lastRow - 1);
    const startRow = lastRow - numToFetch + 1;
    const logRaw = lSheet.getRange(startRow, 1, numToFetch, 6).getDisplayValues();
    recentLogs = logRaw.reverse();
  }

  return {
    config: { 
      current_queue: parseInt(currentQueue) || 1, 
      system_status: systemStatus,
      announcement: announcement
    },
    users: users,
    positions: positions,
    recentLogs: recentLogs
  };
}

function userLogin(code) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const adminPass = ss.getSheetByName('Config').getRange("B4").getValue();
  
  // Check Admin
  if(String(code).trim() == String(adminPass).trim()) {
    return { role: 'ADMIN', id: 'ADMIN', name: 'Administrator', status: 'SYSTEM' };
  }
  
  // Check User
  const users = ss.getSheetByName('Users').getDataRange().getValues();
  for(let i=1; i<users.length; i++) {
    if(String(users[i][2]).trim() == String(code).trim()) {
      return { role: 'USER', id: users[i][0], name: users[i][1], status: users[i][3] };
    }
  }
  return { role: 'ERROR', msg: 'ไม่พบรหัสประจำตัวนี้' };
}

function selectPosition(userId, posId) {
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(10000)) return { status: 'ERROR', msg: 'System Busy' };
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetConfig = ss.getSheetByName('Config');
    const sheetPos = ss.getSheetByName('Positions');
    const sheetUser = ss.getSheetByName('Users');
    const sheetLog = ss.getSheetByName('Logs');
    
    let currentQueue = parseInt(sheetConfig.getRange("B2").getValue());
    const systemStatus = sheetConfig.getRange("B3").getValue();
    
    if(systemStatus !== 'OPEN') return { status: 'ERROR', msg: 'ระบบปิดอยู่' };
    if(parseInt(userId) !== currentQueue) return { status: 'ERROR', msg: `ยังไม่ถึงคิวของคุณ (คิวปัจจุบัน: ${currentQueue})` };

    const posData = sheetPos.getDataRange().getValues();
    let posRow = -1, posName = "", posRegion = "";
    for(let i=1; i<posData.length; i++) {
      if(String(posData[i][0]).trim() === String(posId).trim()) {
        if(posData[i][3] !== 'AVAILABLE') return { status: 'ERROR', msg: 'ตำแหน่งนี้ถูกเลือกไปแล้ว' };
        posRow = i + 1; posName = posData[i][1]; posRegion = posData[i][2]; break;
      }
    }
    if(posRow === -1) return { status: 'ERROR', msg: 'ไม่พบรหัสตำแหน่ง' };

    const userData = sheetUser.getDataRange().getValues();
    let userRow = -1, userName = "";
    for(let i=1; i<userData.length; i++) {
      if(String(userData[i][0]).trim() == String(userId).trim()) { userRow = i + 1; userName = userData[i][1]; break; }
    }
    
    const timestamp = new Date();

    sheetPos.getRange(posRow, 4).setValue('TAKEN');
    sheetPos.getRange(posRow, 5).setValue(userId);
    
    if(userRow !== -1) {
      sheetUser.getRange(userRow, 4).setValue('SELECTED');
      sheetUser.getRange(userRow, 5).setValue(posName);
      sheetUser.getRange(userRow, 6).setValue(timestamp);
    }
    
    sheetLog.appendRow([timestamp, userId, userName, posId, posName, posRegion]);
    sheetConfig.getRange("B2").setValue(currentQueue + 1);
    
    SpreadsheetApp.flush();
    return { status: 'SUCCESS' };
    
  } catch(e) {
    return { status: 'ERROR', msg: 'Error: ' + e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function adminAction(action) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetConfig = ss.getSheetByName('Config');
  
  if(action === 'SKIP') {
    const cur = parseInt(sheetConfig.getRange("B2").getValue()) || 1;
    sheetConfig.getRange("B2").setValue(cur + 1);
  } else if (action === 'TOGGLE_STATUS') {
    const status = sheetConfig.getRange("B3").getValue();
    sheetConfig.getRange("B3").setValue(status === 'OPEN' ? 'PAUSE' : 'OPEN');
  } else if (action === 'BACKUP') {
    // Make a copy of key sheets within the same spreadsheet
    const timestamp = Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd_HHmmss");
    const uSheet = ss.getSheetByName('Users');
    const pSheet = ss.getSheetByName('Positions');
    uSheet.copyTo(ss).setName(`Backup_Users_${timestamp}`);
    pSheet.copyTo(ss).setName(`Backup_Pos_${timestamp}`);
  } else if (action === 'RESET') {
    // 1. Backup First
    const timestamp = Utilities.formatDate(new Date(), "GMT+7", "yyyyMMdd_HHmmss");
    const uSheet = ss.getSheetByName('Users');
    const pSheet = ss.getSheetByName('Positions');
    const lSheet = ss.getSheetByName('Logs');
    uSheet.copyTo(ss).setName(`ResetBackup_Users_${timestamp}`);
    
    // 2. Clear Data
    if(uSheet.getLastRow() > 1) { 
      uSheet.getRange(2, 4, uSheet.getLastRow()-1, 3).clearContent(); // Clear Status, Selection, Time
      uSheet.getRange(2, 4, uSheet.getLastRow()-1, 1).setValue('WAITING'); 
    }
    if(pSheet.getLastRow() > 1) { 
      pSheet.getRange(2, 4, pSheet.getLastRow()-1, 2).clearContent(); // Clear Status, TakenBy
      pSheet.getRange(2, 4, pSheet.getLastRow()-1, 1).setValue('AVAILABLE'); 
    }
    if(lSheet.getLastRow() > 1) { 
      lSheet.deleteRows(2, lSheet.getLastRow()-1); 
    }
    
    // 3. Reset Config
    sheetConfig.getRange("B2").setValue(1);
    sheetConfig.getRange("B3").setValue('OPEN');
  }
  SpreadsheetApp.flush();
  return 'SUCCESS';
}

function adminCRUD(type, action, data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(type === 'USER' ? 'Users' : 'Positions');
  
  if (action === 'CREATE') {
    if (type === 'USER') {
      // Data: { id, name, code }
      sheet.appendRow([data.id, data.name, data.code, 'WAITING', '', '']);
    } else {
      // Data: { id, name, region }
      sheet.appendRow([data.id, data.name, data.region, 'AVAILABLE', '']);
    }
  } else {
    // Find Row
    const allData = sheet.getDataRange().getValues();
    let targetRow = -1;
    // Assuming Column A (Index 0) is the ID
    for (let i = 1; i < allData.length; i++) {
      if (String(allData[i][0]).trim() === String(data.id).trim()) { 
        targetRow = i + 1; 
        break; 
      }
    }
    
    if (targetRow === -1) return 'NOT_FOUND';
    
    if (action === 'DELETE') {
      sheet.deleteRow(targetRow);
    }
    if (action === 'UPDATE') {
      if (type === 'USER') {
        sheet.getRange(targetRow, 2).setValue(data.name);
        sheet.getRange(targetRow, 3).setValue(data.code);
      } else {
        sheet.getRange(targetRow, 2).setValue(data.name);
        sheet.getRange(targetRow, 3).setValue(data.region);
      }
    }
  }
  SpreadsheetApp.flush();
  return 'SUCCESS';
}
