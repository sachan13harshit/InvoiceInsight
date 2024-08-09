const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();
const fetch = require('node-fetch');
global.fetch = fetch;
global.Headers = fetch.Headers;


const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function extractInvoiceDetails(pdfPath) {
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const pdfData = await pdfParse(dataBuffer);

    console.log('PDF Text Content:');
    console.log(pdfData.text);
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const prompt = `
    Extract the following details from this invoice:
    1. Customer details
    2. Products
    3. Total Amount

    Invoice content:
    ${pdfData.text}

    Please format the output as valid JSON, following this exact structure:
    {
      "customerDetails": {
        // Include all relevant customer details here
      },
      "products": [
        // List all products here
      ],
      "totalAmount": "Total amount value"
    }

    Ensure the response is only the JSON object, with no additional text before or after.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text();

    console.log('Raw response from Gemini AI:');
    console.log(responseText);
    console.log('AI Response Type:', typeof responseText);
    console.log('AI Response Length:', responseText.length);

    let extractedData;
    try {
      extractedData = JSON.parse(responseText);
    } catch (jsonError) {
      console.error('Failed to parse entire response as JSON. Attempting to extract JSON from the response.');
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          extractedData = JSON.parse(jsonMatch[0]);
        } catch (nestedJsonError) {
          console.error('Failed to parse extracted JSON. Falling back to structured data extraction.');
          extractedData = extractStructuredData(responseText);
        }
      } else {
        console.error('No JSON-like structure found. Falling back to structured data extraction.');
        extractedData = extractStructuredData(responseText);
      }
    }

    console.log('Extracted Invoice Details:');
    console.log(JSON.stringify(extractedData, null, 2));

    return extractedData;
  } catch (error) {
    console.error('Error extracting invoice details:', error);
    if (error.response) {
      console.error('Error response:', error.response);
    }
  }
}

function extractStructuredData(text) {
  const lines = text.split('\n');
  const data = {
    customerDetails: {},
    products: [],
    totalAmount: ''
  };

  let currentSection = null;

  for (const line of lines) {
    if (line.toLowerCase().includes('customer details:')) {
      currentSection = 'customerDetails';
    } else if (line.toLowerCase().includes('products:')) {
      currentSection = 'products';
    } else if (line.toLowerCase().includes('total amount:')) {
      currentSection = 'totalAmount';
    } else if (currentSection === 'customerDetails') {
      const [key, value] = line.split(':').map(s => s.trim());
      if (key && value) {
        data.customerDetails[key] = value;
      }
    } else if (currentSection === 'products') {
      if (line.trim()) {
        data.products.push(line.trim());
      }
    } else if (currentSection === 'totalAmount') {
      data.totalAmount = line.trim();
    }
  }

  return data;
}

async function processInvoices() {
  const invoicesDir = path.join(__dirname, 'invoices');
  const files = fs.readdirSync(invoicesDir);

  for (const file of files) {
    if (path.extname(file).toLowerCase() === '.pdf') {
      console.log(`Processing: ${file}`);
      await extractInvoiceDetails(path.join(invoicesDir, file));
      console.log('---');
    }
  }
}

processInvoices();