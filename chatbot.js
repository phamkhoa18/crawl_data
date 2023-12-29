import express, { json } from 'express' ;
import axios from 'axios';
import cheerio from 'cheerio' ;
import natural from 'natural';
import nlp from 'node-nlp' ;
import fs from 'fs' ;
import util from 'util' ;
const readFileAsync = util.promisify(fs.readFile);
const writeFileAsync = util.promisify(fs.writeFile)
const app = express() ;

const THUVIEN = 'https://thuvienphapluat.vn/' ;
const tokenizer = new natural.WordTokenizer();
const pos = new natural.BrillPOSTagger();


app.get('/search/:name' ,async (req, res) => {
    try {
    
        // request search thuvienphapluat.vn
        const html = await requestSearch(THUVIEN , 'page/tim-van-ban.aspx?keyword=' , req.params.name) ;
        const $ = cheerio.load(html.data);
        const totalItem = $('.left-col .nqTitle a').length;       
        if (totalItem == 0) {
            return res.status(404).json({ error: 'Không tìm thấy thông tin trên trang web.' });
        }
        // handle arrayItems 
        const arrayItems = [] ;
        $('.left-col').each(async (index, el) => { 
            $(el).find('.nqTitle a').each(async(index , el) => {
                arrayItems.push($(el).attr('href'));
            })
        })
        // handle item[0] in arrayItems 
        const htmlItem = await axios.request(arrayItems[0]) ;

        res.status(200).json({"content" : cheerio.load(htmlItem.data)('#ctl00_Content_ctl00_divNoiDung #divContentDoc').html()});
    } catch (error) {
        res.status(404).json(error) ;
    }
})


app.get('/phantich/:user' , async (req,res) => {
    try {
        // Tạo một trình phân tích ngôn ngữ
        const processor = new nlp.Processor();

        // Phân tích câu chữ bằng tiếng Việt
        const vietnameseText = "Bạn hãy giải thích rõ về luật việt nam năm 2023 có gì thay đổi";

        // Xử lý câu với trình phân tích ngôn ngữ
        processor.addCorpus([
        'Giải thích rõ về luật Việt Nam năm 2023'
        ]);

        const result = processor.process(vietnameseText);

        // Lấy từ khoá chính từ kết quả
        const keywords = result.entities.map(entity => entity.utterance);

        console.log('Keywords:', keywords);
    } catch (error) {
        res.status(404).json(error) ;
    }
})

app.get('/crawlData', async (req, res) => {
    try {
        const results = [];
        for (let i = 0; i < 1000; i++) {
            const result = await handleCrawldata();
            results.push(result);
        }
        res.json(results);
    } catch (error) {
        console.error('Error during crawling data:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

async function handleCrawldata() {
    const page = await readandwriteJson('datavanbanphapluat') ;
    const pagecurent = page ;
    var html = '' ;
    if(page.value.length === 0) {
        // Keep that number and use it
         html = await crawData(page.key);
    } else {
        // create number page new ( + one number) ;
        page.key = parseInt(page.key) + 1;
        console.log(page.key);
        html = await crawData(page.key);
    }
    const $ = cheerio.load(html.data);
    const detailPromises = [];

    $('.left-col').each((index, el) => {
        $(el).find('.nqTitle a').each((index, el) => {
            const title = $(el).html();
            const jobUrl = $(el).attr('href');
            const detailPromise = detailItem(title, jobUrl);
            detailPromises.push(detailPromise);
        });
    });
    try {
        const detailedItems = await Promise.all(detailPromises);
        // All detailItem promises have resolved
          const result = await saveDataToJson('datavanbanphapluat' , detailedItems , page.key);
            if(result) {
                return {number : page.key , status : true};
            } else {
                return {number : page.key , status : false};
            }
    } catch (error) {
        console.error('Error fetching detailed items:', error);
        return { error: 'Internal Server Error' }
    }
}

async function saveDataToJson(existingFileName, newData , numberPage) {
    try {
        // Đọc dữ liệu từ tệp JSON hiện tại
        const existingData = await readFileAsync(`${existingFileName}.json`, 'utf8');
        const existingJson = JSON.parse(existingData);

        // Thêm dữ liệu mới vào mảng hoặc làm bất kỳ xử lý nào bạn cần
        // Kiểm tra xem mảng có tồn tại không
        if (!existingJson.vanbanphapluat[numberPage]) {
            existingJson.vanbanphapluat[numberPage] = [];
        }
        existingJson.vanbanphapluat[numberPage] = existingJson.vanbanphapluat[numberPage].concat(newData);

        // Convert object back to JSON string
        const updatedJsonString = JSON.stringify(existingJson, null, 2);

        // Ghi dữ liệu đã cập nhật vào tệp JSON
        await writeFileAsync(`${existingFileName}.json`, updatedJsonString, 'utf8');
        return true ;
    } catch (error) {
        console.error('Error saving data to JSON file:', error);
    }
}



async function readandwriteJson(name) {
    try {
        // Read the existing JSON data from the file
        const data = await readFileAsync(`${name}.json`, 'utf8');
        // Check if the page number has an array of items
        const jsonObject = JSON.parse(data);
        // Get the last page and its key
        const lastPageInfo = await getLastPageWithKey(jsonObject);
        return lastPageInfo;
    } catch (error) {
        console.log(error);
        return null;
    }
}

// Function to get the last page in the JSON data
async function getLastPageWithKey(jsonObject) {
    const pageKeys = Object.keys(jsonObject.vanbanphapluat);
    const lastPageKey = pageKeys[pageKeys.length - 1];
    const lastPageValue = jsonObject.vanbanphapluat[lastPageKey] || [];
    return { key: lastPageKey, value: lastPageValue };
}



// request search thuvienphapluat.vn
async function requestSearch(orgLink , urlLink , stringSearch) {
    const arraySearch = await axios.request(orgLink + urlLink + stringSearch) ;
    return arraySearch ;
} ;

async function detailItem(title , jobUrl) {
    const html = await axios.request(jobUrl) ;
    const detailItem = {"title" : title , "content" : cheerio.load(html.data)('#ctl00_Content_ctl00_divNoiDung #divContentDoc').html()}
    return detailItem ;
}

async function crawData(numberPage) {
    // read json file to get page number
    const html = await requestSearch(THUVIEN , 'page/tim-van-ban.aspx?keyword=&area=0&match=True&type=0&status=0&signer=0&sort=1&lan=1&scan=0&org=0&fields=&page=' , numberPage) ;
    return html ;
}

app.listen(3000, () => {
    console.log('Search data run port : ' + 3000);
})