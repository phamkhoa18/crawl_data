import cheerio from 'cheerio';
import request from 'request-promise';
import fs from 'fs';
import axios from 'axios';
import { PdfReader } from "pdfreader";
import { createWorker } from 'tesseract.js';
import {fileTypeFromStream} from 'file-type';

import got from 'got';

const data = [];

async function CrawlData(mainUrl, numberPage, categoriesUrl) {
  try {
    const html = await request(`${mainUrl}/${categoriesUrl}.html?page=${numberPage}`);
    const $ = cheerio.load(html);

    const totalItems = $('.block-content .doc-title a').length;
    console.log(totalItems);
    let processedItems = 0;

    $('.block-content').each(async (index, el) => {
      $(el).find('.doc-title a').each(async (index, el) => {
        const jobUrl = $(el).attr('href');
        await processItem(jobUrl, totalItems, processedItems, mainUrl);
      });
    });
  } catch (error) {
    console.error('Error loading main page:', error);
  }
}

async function processItem(jobUrl, totalItems, processedItems, mainUrl) {
  const fullUrl = mainUrl + jobUrl;
  let contentContainer;  // Khai báo biến contentContainer ở đây
  try {
    const detailHtml = await request(fullUrl);
    const $ = cheerio.load(detailHtml);
    const title = $('.the-document-title').text();
    contentContainer = $('.noidungtracuu');

    // Check if the content is a PDF link
    if ($('.embedContent').length > 0) {
      const pdfUrl = $('.embedContent').data('url');

      // check file pdf
      const CheckFilePdf = await checkPdfFormat(pdfUrl);

      if(CheckFilePdf == 'pdf' ) {
          await crawlFilePdf(pdfUrl , title , fullUrl , processedItems) ;
      } else {
        return ;
      }
  
    } else {
      const content = contentContainer.text();
      data.push({
        title: title,
        content: content,
        href: fullUrl,
      });

      console.log(data) ;
      processedItems++;
    }
  } catch (err) {
    console.error('Error processing item:', err);
  } finally {
    if (processedItems === totalItems) {
      saveToJson();
    }
  }
}


async function crawlFilePdf(pdfUrl, title, href, processedItems) {
  try {
    // Download PDF file
    const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
    const pdfData = response.data;

    // Initialize Tesseract.js worker
    const worker = await createWorker('vie', 1);


    const contentArray = [];

    new PdfReader().parseBuffer(pdfData, async (err, item) => {
      if (err) {
        console.error("Error during PDF parsing:", err);
      } else if (!item) {
        // Khi kết thúc, ghi dữ liệu đã định dạng lại vào tệp JSON
        const contentString = contentArray.join(' ').trim();
        data.push({
          title: title,
          content: contentString,
          href: href,
        });

        console.log(data);
        processedItems++;

        // Stop Tesseract.js worker after processing the PDF
        await worker.terminate();
      } else if (item.text) {
        contentArray.push(item.text);
      } else if (item.page && item.page.raw) {
        console.log(item.page && item.page.raw);
        // Truyền hình ảnh từ PDF vào Tesseract.js để nhận diện ký tự OCR
        const { data } = await worker.recognize(item.page.raw);
        if (data && data.text) {
          contentArray.push(data.text);
        }
      }
    });
  } catch (error) {
    console.error(error);
  }
}

// const pdfUrl = 'https://static.luatvietnam.vn/xem-noi-dung-file-quyet-dinh-21-2023-qd-ubnd-tien-giang-quy-che-bao-ve-bi-mat-nha-nuoc-271839-d2/uploaded/VIETLAWFILE/2023/10/21_2023_QD-UBND_251023101111.pdf.aspx';

// crawlFilePdf(pdfUrl, 'khoa', '2323', 2);

async function downloadPdf(pdfUrl) {
  try {
    const response = await axios.get(pdfUrl, { responseType: 'arraybuffer' });
    return response.data;
  } catch (error) {
    console.error(`Error downloading PDF: ${error.message}`);
    throw error;
  }
}

async function checkPdfType(pdfUrl) {
  try {
    const pdfData = await downloadPdf(pdfUrl);

    return new Promise((resolve, reject) => {
      const pdfReader = new PdfReader(null);
      // isText 
      let isText = false ;
      // isImage
      let isImage = false ;
      pdfReader.parseBuffer(pdfData, (err, item) => {
        if (err) {
          console.error(`Error parsing PDF: ${err}`);
          reject(err);
          return;
        }

        console.log(item);
        if (item && item.text) {
          isText = true ;
        } else {
          isImage = true ;
        }
        if (item === undefined) {
          // Assume the end of parsing when item is null
          console.log(isText + ' = ' + isImage);

          if (isText && !isImage) {
            resolve('text_pdf');
          } else if (isImage && !isText) {
            resolve('image_pdf');
          } else {
            resolve('unknown_pdf');
          }
        }
      });
    });
  } catch (error) {
    console.error(`Error checking PDF type: ${error.message}`);
    throw error;
  }
}

// Sử dụng hàm với URL của file PDF
const pdfUrlImage = 'https://static.luatvietnam.vn/xem-noi-dung-file-quyet-dinh-21-2023-qd-ubnd-tien-giang-quy-che-bao-ve-bi-mat-nha-nuoc-271839-d2/uploaded/VIETLAWFILE/2023/10/21_2023_QD-UBND_251023101111.pdf.aspx';
const pdfUrlText = 'https://luatvietnam.vn/an-ninh-quoc-gia/quyet-dinh-1994-qd-ubnd-nam-dinh-2023-kien-toan-bcd-phong-chong-toi-pham-269917-d2.html';

// Sử dụng await để đợi kết quả của promise
(async () => {
  const result = await checkPdfType(pdfUrlText);
  console.log(result);
})();



function saveToJson() {
  const jsonData = JSON.stringify(data, null, 2);
  fs.writeFile('output.json', jsonData, 'utf8', (err) => {
    if (err) {
      console.error('Error saving JSON file:', err);
    } else {
      console.log('Data has been saved to output.json');
    }
  });
}


async function checkPdfFormat(url) {
  try {
    console.log(url);
    const stream = got.stream(url);
    const CheckPdfResult = await fileTypeFromStream(stream) ;

    if(CheckPdfResult.ext === 'pdf' , CheckPdfResult.mime === 'application/pdf') {
        return 'pdf'  ;
    } else {
        return 'no_file'
    }
  } catch (error) {
    console.error('Lỗi khi tải trang web:', error.message);
  }
}



const mainUrl = 'https://luatvietnam.vn';
const numberPage = 1;
const categoriesUrl = 'an-ninh-quoc-gia-46-f1';

// CrawlData(mainUrl, numberPage, categoriesUrl);
