# Aarogya Saathi - A Medical Report Simplifier

A web application that helps patients understand their medical reports through AI-powered chat interface. Upload a PDF.

#### Common Issues

1. **"404 models/gemini-pro is not found" or similar model errors**
   ```
   Error: 404 models/gemini-2.0-flash is not found for API version v1beta
   ```
   
   **Solution**: Google frequently updates model names. Run our diagnostic tool:
   ```bash
   python fix_gemini_issue.py
   ```
   
   This will:
   - Test all available models
   - Show which ones work with your API key
   - Provide the exact model name to use
   
   **Quick fix**: The issue is usually that `gemini-2.0-flash` isn't available yet. Use `gemini-1.5-flash` instead.

2. **Gemini API key not configured** and ask questions in simple language to get easy-to-understand explanations.

## Features

- **PDF Processing**: Supports text extraction from PDFs with OCR fallback for scanned documents
- **AI-Powered Chat**: Uses Google Gemini AI to provide medical explanations in simple terms
- **Multi-Language Support**: Choose from 10+ languages for responses
- **Lab Value Highlighting**: Automatically highlights normal, abnormal, and critical lab values
- **Text-to-Speech**: Listen to AI responses with built-in speech synthesis
- **PDF Export**: Export entire conversations as PDF files
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Session Management**: Secure handling of uploaded documents and conversation history

## Setup Instructions

### Prerequisites

1. **Python 3.8+** installed on your system
2. **Google Gemini API Key** - Get one from [Google AI Studio](https://aistudio.google.com/)
3. **Tesseract OCR** (for scanned PDF support):
   - Windows: Download from [GitHub releases](https://github.com/UB-Mannheim/tesseract/wiki)
   - macOS: `brew install tesseract`
   - Linux: `sudo apt-get install tesseract-ocr`

### Installation

1. **Clone or download** this project to your computer

2. **Install Python dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up environment variables**:
   
   **Option A: Use the setup script (Windows)**:
   ```bash
   setup_api.bat
   ```
   
   **Option B: Set manually**:
   - Windows: `set GEMINI_API_KEY=your_actual_gemini_api_key_here`
   - macOS/Linux: `export GEMINI_API_KEY=your_actual_gemini_api_key_here`
   
   **Option C: Create a `.env` file**:
   ```
   GEMINI_API_KEY=your_actual_gemini_api_key_here
   ```

4. **Test your setup**:
   
   **Quick test**:
   ```bash
   python quick_test.py
   ```
   
   **Comprehensive test**:
   ```bash
   python test_api.py
   ```
   
   This will verify that your API key works and all dependencies are installed correctly.

5. **Configure Tesseract** (if not in PATH):
   In `app.py`, you may need to specify the Tesseract executable path:
   ```python
   pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'  # Windows
   ```

### Running the Application

1. **Start the Flask server**:
   ```bash
   python app.py
   ```

2. **Open your web browser** and go to:
   ```
   http://localhost:5000
   ```

3. **Upload a medical report** (PDF format) and start asking questions!

### Testing Your Setup

Before running the main application, you can test your configuration:

- **Quick API test**: `python quick_test.py`
- **Full system test**: `python test_api.py`
- **Windows setup helper**: `setup_api.bat`

## Usage Guide

### Uploading Reports
- Click "Choose PDF File" or drag and drop a PDF into the upload area
- The app will extract text and process the document
- If text extraction fails, OCR will automatically attempt to read scanned content

### Asking Questions
- Type questions in the chat box at the bottom
- Examples:
  - "What do my test results mean?"
  - "Are there any abnormal values?"
  - "What should I do next?"
  - "Explain my blood work in simple terms"

### Language Selection
- Use the language dropdown to choose your preferred response language
- The AI will respond in the selected language

### Features
- **Lab Value Colors**:
  - 🟢 Green: Normal values
  - 🟡 Orange: Slightly abnormal values
  - 🔴 Red: Critical values requiring attention
- **Text-to-Speech**: Click the volume icon next to any response to hear it read aloud
- **Export**: Save your entire conversation as a PDF file
- **Clear**: Start a new session with a different report

## File Structure

```
Medical Report Simplifier/
├── app.py                 # Flask backend server
├── requirements.txt       # Python dependencies
├── README.md             # This file
├── .env.example          # Environment variables template
├── test_api.py           # Comprehensive setup test
├── quick_test.py         # Quick API connection test
├── setup_api.bat         # Windows API key setup helper
├── templates/
│   └── index.html        # Main web interface
└── static/
    ├── style.css         # Styling and responsive design
    └── script.js         # Frontend JavaScript functionality
```

## API Endpoints

- `GET /` - Main application interface
- `GET /health` - Server status check
- `POST /upload_pdf` - Upload and process PDF files
- `POST /chat` - Send messages and get AI responses
- `POST /export_conversation` - Export chat history as PDF
- `POST /clear_session` - Clear current session data

## Security Features

- File type validation (PDF only)
- File size limits (16MB maximum)
- Session-based data storage
- Automatic temporary file cleanup
- CORS protection for API endpoints

## Troubleshooting

### Common Issues

2. **Gemini API key not configured**
   - Make sure you've set the `GEMINI_API_KEY` environment variable
   - Verify the API key is valid and has proper permissions

3. **Could not extract text from PDF**
   - The PDF might be an image/scanned document
   - Ensure Tesseract OCR is properly installed
   - Try a different PDF file

4. **Upload errors**
   - Check that the file is a valid PDF
   - Ensure file size is under 16MB
   - Verify sufficient disk space for temporary files

5. **Text-to-speech not working**
   - Feature requires a modern browser with Web Speech API support
   - Check browser permissions for speech synthesis

### Development Mode

To run in development mode with auto-reload:
```bash
export FLASK_ENV=development  # macOS/Linux
set FLASK_ENV=development     # Windows
python app.py
```

## Production Deployment

For production deployment:

1. **Change the secret key** in `app.py`
2. **Use a production WSGI server** like Gunicorn
3. **Set up a proper database** instead of in-memory storage
4. **Configure HTTPS** for secure file uploads
5. **Set up proper logging** and error handling
6. **Use environment variables** for all configuration

## Privacy and Data Handling

- Uploaded PDFs are processed temporarily and deleted immediately after text extraction
- Conversation data is stored in memory only and cleared when the session ends
- No medical data is permanently stored on the server
- All communication with AI services is encrypted

## Disclaimer

⚠️ **Important Medical Disclaimer**: This tool provides general information only and is not a substitute for professional medical advice, diagnosis, or treatment. Always consult qualified healthcare providers for medical decisions and interpretation of medical reports.

## License

This project is for educational and demonstration purposes. Please ensure compliance with healthcare data regulations (HIPAA, GDPR, etc.) in your jurisdiction before using with real medical data.

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Ensure all prerequisites are properly installed
3. Verify your Gemini API key is valid and properly configured

---

Built with ❤️ using Flask, Google Gemini AI, and modern web technologies.
