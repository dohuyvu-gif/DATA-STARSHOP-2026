/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// --- CONFIGURATION ---
const VISION_API_KEY = "YOUR_GOOGLE_CLOUD_VISION_API_KEY"; // Hướng dẫn lấy key ở cuối file
const SHEET_ID = "1GSSVla9O1KocZpz4A8yaTuX6EUyurxgeiu9ITqptpmE";
const FOLDER_GPKD_ID = "1UF2tMEB0v2BjVYyKxFeGIGXrnAOizLbJ";
const FOLDER_CCCD_ID = "1uJZFafbPZ_WFOF-Dplykp9f9jCWlf0YD";

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('DMS Field Data Collection')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Kiểm tra Mã DMS trong sheet danh sách thực tế
 */
function validateDMS(dmsCode) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName('DMS_LIST');
    if (!sheet) throw new Error("Không tìm thấy sheet 'DMS_LIST'");
    
    const data = sheet.getDataRange().getValues();
    // Giả sử Mã DMS nằm ở cột A (index 0)
    const exists = data.some(row => row[0].toString().toUpperCase().trim() === dmsCode.toUpperCase().trim());
    
    if (exists) {
      return { success: true };
    } else {
      throw new Error("Mã DMS không tồn tại trong danh sách dữ liệu Sheet.");
    }
  } catch (error) {
    throw new Error("Lỗi xác thực: " + error.message);
  }
}

/**
 * Xử lý lưu ảnh và OCR
 */
function processSubmission(data) {
  try {
    const { dmsCode, employeeId, gpkdBase64, cccdBase64 } = data;

    // 1. Lưu ảnh vào Drive
    const gpkdFile = saveToDrive(gpkdBase64, `${dmsCode}_GIAY_PHEP_KINH_DOANH`, FOLDER_GPKD_ID);
    const cccdFile = saveToDrive(cccdBase64, `${dmsCode}_CAN_CUOC_CONG_DAN`, FOLDER_CCCD_ID);

    // 2. Thực hiện OCR thông qua Vision API
    const gpkdText = performOCR(gpkdBase64);
    const cccdText = performOCR(cccdBase64);

    // 3. Regex bóc tách dữ liệu
    const gpkdData = extractGPKD(gpkdText);
    const cccdData = extractCCCD(cccdText);

    // 4. Lưu vào Google Sheets
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName('REPORT');
    
    sheet.appendRow([
      dmsCode,
      employeeId,
      gpkdData.licenseNum,
      gpkdData.businessName,
      cccdData.idNum,
      cccdData.fullName,
      new Date() // Thêm thời gian nộp
    ]);

    return { success: true, message: "Dữ liệu đã được lưu thành công!" };
  } catch (error) {
    console.error(error);
    throw new Error("Lỗi xử lý: " + error.message);
  }
}

function saveToDrive(base64, fileName, folderId) {
  const folder = DriveApp.getFolderById(folderId);
  const contentType = base64.substring(5, base64.indexOf(';'));
  const bytes = Utilities.base64Decode(base64.split(',')[1]);
  const blob = Utilities.newBlob(bytes, contentType, fileName);
  return folder.createFile(blob);
}

function performOCR(base64Data) {
  const url = `https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`;
  const payload = {
    requests: [{
      image: { content: base64Data.split(',')[1] },
      features: [{ type: "TEXT_DETECTION" }]
    }]
  };
  
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const result = JSON.parse(response.getContentText());
  
  if (result.responses && result.responses[0].fullTextAnnotation) {
    return result.responses[0].fullTextAnnotation.text;
  }
  return "";
}

/**
 * Regex bóc tách GPKD
 */
function extractGPKD(text) {
  // Tìm số GPHKD (thường là chuỗi 10 số hoặc format GPHKD)
  const licenseMatch = text.match(/(?:Số|No)\s*[:.]?\s*(\d{8,14})/i);
  // Tìm tên doanh nghiệp (thường nằm sau "TÊN CÔNG TY" hoặc "TÊN DOANH NGHIỆP")
  const nameMatch = text.match(/(?:TÊN\s+(?:CÔNG|DOANH)\s+(?:TY|NGHIỆP)|Tên\s+đăng\s+ký)\s*[:.]?\s*([^\n\r]+)/i);
  
  return {
    licenseNum: licenseMatch ? licenseMatch[1].trim() : "Không tìm thấy",
    businessName: nameMatch ? nameMatch[1].trim() : "Không tìm thấy"
  };
}

/**
 * Regex bóc tách CCCD
 */
function extractCCCD(text) {
  // Tìm số CCCD (12 số)
  const idMatch = text.match(/(?:\d{12})/);
  // Tìm Họ tên (sau "Họ và tên" hoặc "Full name")
  const nameMatch = text.match(/(?:Họ và tên|Full name)\s*[:.]?\s*([^\n\r]+)/i);

  return {
    idNum: idMatch ? idMatch[0] : "Không tìm thấy",
    fullName: nameMatch ? nameMatch[1].trim() : "Không tìm thấy"
  };
}

/**
 * HƯỚNG DẪN LẤY VISION API KEY:
 * 1. Truy cập https://console.cloud.google.com/
 * 2. Tạo một Project mới (hoặc chọn project hiện có).
 * 3. Tìm kiếm "Cloud Vision API" trong thanh tìm kiếm và bấm "Enable".
 * 4. Vào mục "Credentials" -> "Create Credentials" -> "API Key".
 * 5. Coppy Key đó và dán vào biến VISION_API_KEY ở dòng 8.
 */
