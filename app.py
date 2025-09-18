from flask import Flask, request, jsonify, render_template, session, send_file
from flask_cors import CORS
import os
import uuid
import tempfile
import json
import re
from datetime import datetime
import requests
import google.generativeai as genai
from io import BytesIO
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.units import inch

# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv()

# PDF processing imports
try:
    import PyPDF2
except ImportError:
    PyPDF2 = None

try:
    import pdfplumber
except ImportError:
    pdfplumber = None

try:
    from pdf2image import convert_from_path
    import pytesseract
except ImportError:
    convert_from_path = None
    pytesseract = None

app = Flask(__name__)
app.secret_key = 'your-secret-key-change-this'  # Change this in production
CORS(app)

# Configure Gemini AI
# You'll need to set your API key as an environment variable: GEMINI_API_KEY
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if GEMINI_API_KEY:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        print(f"✅ Gemini API configured successfully")
    except Exception as e:
        print(f"⚠️ Warning: Gemini API configuration failed: {e}")
else:
    print("⚠️ Warning: GEMINI_API_KEY environment variable not set")

# In-memory storage for sessions (use Redis/database in production)
session_data = {}

# Session persistence to handle Flask auto-reload
SESSION_FILE = os.path.join(tempfile.gettempdir(), 'medical_app_sessions.json')

def load_sessions():
    """Load sessions from file"""
    global session_data
    try:
        if os.path.exists(SESSION_FILE):
            with open(SESSION_FILE, 'r') as f:
                session_data = json.load(f)
                print(f"✅ Loaded {len(session_data)} sessions from disk")
    except Exception as e:
        print(f"⚠️ Could not load sessions: {e}")
        session_data = {}

def save_sessions():
    """Save sessions to file"""
    try:
        with open(SESSION_FILE, 'w') as f:
            json.dump(session_data, f)
    except Exception as e:
        print(f"⚠️ Could not save sessions: {e}")

# Load existing sessions on startup
load_sessions()

# Configure upload folder
UPLOAD_FOLDER = tempfile.gettempdir()
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

@app.route('/')
def index():
    """Serve the main chat interface"""
    return render_template('index.html')

@app.route('/health')
def health():
    """Health check endpoint"""
    return jsonify({"status": "Server running", "timestamp": datetime.now().isoformat()})

@app.route('/test-chart')
def test_chart():
    """Serve Chart.js test page"""
    return send_file('test_chart.html')

@app.route('/upload_pdf', methods=['POST'])
def upload_pdf():
    """Handle PDF upload and text extraction"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not file.filename.lower().endswith('.pdf'):
            return jsonify({'error': 'File must be a PDF'}), 400
        
        # Generate session ID if not provided
        session_id = request.form.get('session_id', str(uuid.uuid4()))
        
        # Save uploaded file temporarily
        filename = f"{session_id}_{file.filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        # Extract text from PDF
        extracted_text = extract_text_from_pdf(filepath)
        
        # Clean up temporary file
        try:
            os.remove(filepath)
        except:
            pass
        
        if not extracted_text.strip():
            return jsonify({'error': 'Could not extract text from PDF'}), 400
        
        # Extract lab data for visualization
        lab_data = extract_lab_data_with_gemini(extracted_text)
        
        # Store in session data
        if session_id not in session_data:
            session_data[session_id] = {
                'pdf_text': '',
                'conversation_history': [],
                'language': 'English',
                'lab_data': [],
                'upload_time': datetime.now().isoformat(),
                'filename': file.filename
            }
        
        session_data[session_id]['pdf_text'] = extracted_text
        session_data[session_id]['lab_data'] = lab_data
        session_data[session_id]['filename'] = file.filename
        
        # Save sessions to disk
        save_sessions()
        
        print(f"✅ Session {session_id} created with {len(lab_data)} lab tests")

        return jsonify({
            'success': True,
            'session_id': session_id,
            'message': 'PDF processed successfully',
            'text_preview': extracted_text[:500] + '...' if len(extracted_text) > 500 else extracted_text,
            'lab_data': lab_data,
            'has_lab_data': len(lab_data) > 0
        })
        
    except Exception as e:
        return jsonify({'error': f'Error processing PDF: {str(e)}'}), 500

def extract_text_from_pdf(filepath):
    """Extract text from PDF using multiple methods"""
    text = ""
    
    # Method 1: Try PyPDF2
    if PyPDF2:
        try:
            with open(filepath, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                for page in pdf_reader.pages:
                    text += page.extract_text() + "\n"
            if text.strip():
                return text
        except Exception as e:
            print(f"PyPDF2 failed: {e}")
    
    # Method 2: Try pdfplumber
    if pdfplumber:
        try:
            with pdfplumber.open(filepath) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"
            if text.strip():
                return text
        except Exception as e:
            print(f"pdfplumber failed: {e}")
    
    # Method 3: OCR fallback
    if convert_from_path and pytesseract:
        try:
            pages = convert_from_path(filepath)
            for page in pages:
                text += pytesseract.image_to_string(page) + "\n"
            return text
        except Exception as e:
            print(f"OCR failed: {e}")
    
    return text

@app.route('/chat', methods=['POST'])
def chat():
    """Handle chat messages and generate responses"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        session_id = data.get('session_id')
        message = data.get('message', '').strip()
        language = data.get('language', 'English')
        
        if not session_id or not message:
            return jsonify({'error': 'Session ID and message are required'}), 400
        
        if session_id not in session_data:
            return jsonify({'error': 'Session not found. Please upload a PDF first.'}), 400
        
        # Update language preference
        session_data[session_id]['language'] = language
        
        # Get session data
        pdf_text = session_data[session_id]['pdf_text']
        conversation_history = session_data[session_id]['conversation_history']
        
        # Generate response using Gemini
        response = generate_gemini_response(pdf_text, conversation_history, message, language)
        
        # Add to conversation history
        conversation_history.append({'role': 'user', 'content': message})
        conversation_history.append({'role': 'assistant', 'content': response})
        
        # Truncate history to last 10 messages
        if len(conversation_history) > 20:  # 10 pairs of user/assistant messages
            conversation_history = conversation_history[-20:]
        
        session_data[session_id]['conversation_history'] = conversation_history
        
        return jsonify({
            'success': True,
            'response': response,
            'session_id': session_id
        })
    
    except Exception as e:
        return jsonify({'error': f'Error generating response: {str(e)}'}), 500

def generate_gemini_response(pdf_text, conversation_history, user_message, language):
    """Generate response using Gemini AI"""
    try:
        # Build context prompt with enhanced formatting instructions
        system_prompt = f"""
You are a medical assistant that simplifies medical reports for patients.

### Guidelines
1. Respond in {language}.
2. Use **plain, to-the-point explanations** (Gemini-style).
   - Example: "Your vitamin D is low → may cause tiredness and weak bones."
3. For lab values, categorize as:
   - NORMAL, SLIGHTLY_ABNORMAL, CRITICAL
   - Format: **[TYPE:value]**
4. After each result:
   - Explain in plain English
   - Cite a trusted source (Mayo Clinic, CDC, NIH, etc.)
   - Give simple lifestyle advice if relevant
5. Be empathetic but concise.
6. Always advise consulting a healthcare provider.
7. If user asks unrelated questions → redirect to the report.

### Formatting
- Use ## for main sections, ### for subsections
- Bold key terms and values
- Bullets for lists
- Plain English + Lifestyle tips under each abnormal finding

### Example
## Your Test Results

- **Glucose**: **[SLIGHTLY_ABNORMAL:110 mg/dL]**  
  *Plain English:* Slightly high blood sugar, may mean risk of diabetes.  
  *(Source: CDC)*  
  *Lifestyle Tip:* Cut down on sweets, walk daily.

- **Cholesterol**: **[CRITICAL:280 mg/dL]**  
  *Plain English:* Very high cholesterol, raises heart disease risk.  
  *(Source: AHA)*  
  *Lifestyle Tip:* Eat more vegetables, avoid fried foods, see your doctor soon.

---

MEDICAL REPORT CONTEXT:
{pdf_text}

CONVERSATION HISTORY:
"""

        
        # Add conversation history
        for msg in conversation_history[-10:]:  # Last 5 pairs
            role = "Patient" if msg['role'] == 'user' else "Assistant"
            system_prompt += f"{role}: {msg['content']}\n"
        
        system_prompt += f"\nPatient: {user_message}\nAssistant:"
        
        # Use Gemini API
        if GEMINI_API_KEY:
            try:
                # Try the current model name (2024-2025)
                model = genai.GenerativeModel('gemini-2.0-flash')
                response = model.generate_content(system_prompt)
                return response.text
            except Exception as model_error:
                # Fallback to alternative model names
                try:
                    model = genai.GenerativeModel('gemini-1.5-flash')
                    response = model.generate_content(system_prompt)
                    return response.text
                except Exception:
                    try:
                        model = genai.GenerativeModel('gemini-1.5-pro')
                        response = model.generate_content(system_prompt)
                        return response.text
                    except Exception:
                        try:
                            model = genai.GenerativeModel('gemini-pro')
                            response = model.generate_content(system_prompt)
                            return response.text
                        except Exception:
                            raise model_error
        else:
            # Fallback response for demo purposes
            return f"I understand your question about the medical report. However, the Gemini API key is not configured. Please set up your API key to get personalized medical explanations in {language}. In the meantime, I recommend discussing your report with your healthcare provider."
    
    except Exception as e:
        return f"I apologize, but I'm having trouble generating a response right now. Please try again or consult with your healthcare provider. Error: {str(e)}"

@app.route('/export_conversation', methods=['POST'])
def export_conversation():
    """Export conversation as PDF"""
    try:
        data = request.get_json()
        session_id = data.get('session_id')
        
        if not session_id or session_id not in session_data:
            return jsonify({'error': 'Session not found'}), 400
        
        conversation_history = session_data[session_id]['conversation_history']
        
        # Create PDF
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        styles = getSampleStyleSheet()
        story = []
        
        # Title
        title = Paragraph("Medical Report Conversation", styles['Title'])
        story.append(title)
        story.append(Spacer(1, 12))
        
        # Add conversation
        for msg in conversation_history:
            role = "You" if msg['role'] == 'user' else "Medical Assistant"
            content = f"<b>{role}:</b> {msg['content']}"
            p = Paragraph(content, styles['Normal'])
            story.append(p)
            story.append(Spacer(1, 12))
        
        doc.build(story)
        buffer.seek(0)
        
        return send_file(
            buffer,
            as_attachment=True,
            download_name=f'medical_conversation_{session_id[:8]}.pdf',
            mimetype='application/pdf'
        )
    
    except Exception as e:
        return jsonify({'error': f'Error exporting conversation: {str(e)}'}), 500

@app.route('/clear_session', methods=['POST'])
def clear_session():
    """Clear session data"""
    try:
        data = request.get_json()
        session_id = data.get('session_id')
        
        if session_id and session_id in session_data:
            del session_data[session_id]
        
        return jsonify({'success': True, 'message': 'Session cleared'})
    
    except Exception as e:
        return jsonify({'error': f'Error clearing session: {str(e)}'}), 500

@app.route('/upload', methods=['POST'])
def upload_medical_report():
    """Handle medical report upload and extract lab data"""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not file.filename.lower().endswith('.pdf'):
            return jsonify({'error': 'File must be a PDF'}), 400
        
        # Generate session ID
        session_id = str(uuid.uuid4())
        
        # Save uploaded file temporarily
        filename = f"{session_id}_{file.filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        # Extract text from PDF
        extracted_text = extract_text_from_pdf(filepath)
        
        # Clean up temporary file
        try:
            os.remove(filepath)
        except:
            pass
        
        if not extracted_text.strip():
            return jsonify({'error': 'Could not extract text from PDF'}), 400
        
        # Extract lab data using Gemini
        lab_data = extract_lab_data_with_gemini(extracted_text)
        
        # Store in session data
        session_data[session_id] = {
            'pdf_text': extracted_text,
            'lab_data': lab_data,
            'upload_time': datetime.now().isoformat(),
            'filename': file.filename
        }
        
        return jsonify({
            'success': True,
            'session_id': session_id,
            'lab_data': lab_data,
            'message': 'Medical report processed successfully'
        })
    
    except Exception as e:
        return jsonify({'error': f'Error processing medical report: {str(e)}'}), 500

@app.route('/results/<session_id>')
def show_results(session_id):
    """Serve the results visualization page"""
    print(f"🔍 Looking for session {session_id} in {len(session_data)} sessions")
    print(f"📋 Available sessions: {list(session_data.keys())}")
    
    if session_id not in session_data:
        print(f"❌ Session {session_id} not found")
        return render_template('error.html', error=f'Session {session_id} not found. Available sessions: {len(session_data)}'), 404
    
    print(f"✅ Session {session_id} found with {len(session_data[session_id].get('lab_data', []))} lab tests")
    return render_template('results.html', session_id=session_id)

@app.route('/api/results/<session_id>')
def get_results_data(session_id):
    """API endpoint to get lab results data"""
    if session_id not in session_data:
        return jsonify({'error': 'Session not found'}), 404
    
    data = session_data[session_id]
    lab_data = data.get('lab_data', [])
    
    # Calculate summary statistics
    summary = calculate_lab_summary(lab_data)
    
    return jsonify({
        'success': True,
        'lab_data': lab_data,
        'summary': summary,
        'filename': data.get('filename', 'Unknown'),
        'upload_time': data.get('upload_time')
    })

@app.route('/export_results/<session_id>/<format>')
def export_results(session_id, format):
    """Export lab results as PDF or CSV"""
    if session_id not in session_data:
        return jsonify({'error': 'Session not found'}), 404
    
    data = session_data[session_id]
    lab_data = data.get('lab_data', [])
    
    if format.lower() == 'csv':
        return export_results_csv(lab_data, session_id)
    elif format.lower() == 'pdf':
        return export_results_pdf(lab_data, session_id, data.get('filename', 'Unknown'))
    else:
        return jsonify({'error': 'Invalid format. Use csv or pdf'}), 400

def extract_lab_data_with_gemini(text):
    """Extract structured lab data using Gemini AI"""
    try:
        system_prompt = f"""You are a medical data extraction specialist. Extract lab test results from the provided medical report text.

INSTRUCTIONS:
1. Extract ONLY laboratory test results with numerical values
2. For each test, extract: test name, patient value, unit, reference range, and status
3. Classify each result as NORMAL, SLIGHTLY_ABNORMAL, or CRITICAL based on reference ranges
4. Return ONLY valid JSON array format - no markdown, no explanations

JSON FORMAT REQUIRED:
[
  {{
    "test": "Test Name",
    "value": numeric_value,
    "unit": "unit",
    "range": "reference_range",
    "status": "NORMAL|SLIGHTLY_ABNORMAL|CRITICAL",
    "explanation": "Brief explanation of what this test measures"
  }}
]

CLASSIFICATION RULES:
- NORMAL: Value within reference range
- SLIGHTLY_ABNORMAL: Value 10-30% outside reference range
- CRITICAL: Value >30% outside reference range or clinically dangerous

MEDICAL REPORT TEXT:
{text}

Extract lab data as JSON array:"""

        if GEMINI_API_KEY:
            try:
                model = genai.GenerativeModel('gemini-2.0-flash')
                response = model.generate_content(system_prompt)
                
                # Extract JSON from response
                response_text = response.text.strip()
                
                # Clean the response text more thoroughly
                # Remove markdown code blocks if present
                if '```' in response_text:
                    # Extract content between code blocks
                    import re
                    match = re.search(r'```(?:json)?\s*([\s\S]*?)```', response_text)
                    if match:
                        response_text = match.group(1).strip()
                    else:
                        # Fallback: remove all markdown
                        response_text = re.sub(r'```[^\n]*\n?', '', response_text)
                        response_text = re.sub(r'\n?```', '', response_text)
                
                # Find JSON array in the text
                start_idx = response_text.find('[')
                end_idx = response_text.rfind(']')
                
                if start_idx != -1 and end_idx != -1:
                    response_text = response_text[start_idx:end_idx+1]
                
                # Parse JSON
                lab_data = json.loads(response_text)
                
                # Validate structure
                if isinstance(lab_data, list):
                    validated_data = []
                    for item in lab_data:
                        if all(key in item for key in ['test', 'value', 'unit', 'range', 'status']):
                            # Ensure value is numeric
                            try:
                                item['value'] = float(item['value'])
                                validated_data.append(item)
                            except (ValueError, TypeError):
                                continue
                    return validated_data
                else:
                    return []
                    
            except Exception as e:
                print(f"Gemini extraction error: {e}")
                return []
        else:
            # Fallback demo data
            return [
                {
                    "test": "Glucose",
                    "value": 110,
                    "unit": "mg/dL",
                    "range": "70-100",
                    "status": "SLIGHTLY_ABNORMAL",
                    "explanation": "Blood sugar level - slightly elevated"
                },
                {
                    "test": "Cholesterol",
                    "value": 280,
                    "unit": "mg/dL",
                    "range": "<200",
                    "status": "CRITICAL",
                    "explanation": "Total cholesterol - high risk for heart disease"
                }
            ]
    except Exception as e:
        print(f"Lab data extraction error: {e}")
        return []

def calculate_lab_summary(lab_data):
    """Calculate summary statistics for lab data"""
    summary = {
        'total_tests': len(lab_data),
        'normal': 0,
        'slightly_abnormal': 0,
        'critical': 0
    }
    
    for test in lab_data:
        status = test.get('status', '').upper()
        if status == 'NORMAL':
            summary['normal'] += 1
        elif status == 'SLIGHTLY_ABNORMAL':
            summary['slightly_abnormal'] += 1
        elif status == 'CRITICAL':
            summary['critical'] += 1
    
    return summary

def export_results_csv(lab_data, session_id):
    """Export lab results as CSV"""
    import csv
    from io import StringIO
    
    output = StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow(['Test Name', 'Patient Value', 'Unit', 'Reference Range', 'Status', 'Explanation'])
    
    # Write data
    for test in lab_data:
        writer.writerow([
            test.get('test', ''),
            test.get('value', ''),
            test.get('unit', ''),
            test.get('range', ''),
            test.get('status', ''),
            test.get('explanation', '')
        ])
    
    output.seek(0)
    return send_file(
        BytesIO(output.getvalue().encode('utf-8')),
        as_attachment=True,
        download_name=f'lab_results_{session_id[:8]}.csv',
        mimetype='text/csv'
    )

def export_results_pdf(lab_data, session_id, filename):
    """Export lab results as PDF"""
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    styles = getSampleStyleSheet()
    story = []
    
    # Title
    title = Paragraph(f"Lab Results Analysis - {filename}", styles['Title'])
    story.append(title)
    story.append(Spacer(1, 12))
    
    # Summary
    summary = calculate_lab_summary(lab_data)
    summary_text = f"Total Tests: {summary['total_tests']} | Normal: {summary['normal']} | Slightly Abnormal: {summary['slightly_abnormal']} | Critical: {summary['critical']}"
    summary_para = Paragraph(summary_text, styles['Heading2'])
    story.append(summary_para)
    story.append(Spacer(1, 12))
    
    # Test results
    for test in lab_data:
        test_title = Paragraph(f"<b>{test.get('test', 'Unknown Test')}</b>", styles['Heading3'])
        story.append(test_title)
        
        test_details = f"""
        <b>Value:</b> {test.get('value', 'N/A')} {test.get('unit', '')}<br/>
        <b>Reference Range:</b> {test.get('range', 'N/A')}<br/>
        <b>Status:</b> {test.get('status', 'Unknown')}<br/>
        <b>Explanation:</b> {test.get('explanation', 'No explanation available')}
        """
        test_para = Paragraph(test_details, styles['Normal'])
        story.append(test_para)
        story.append(Spacer(1, 12))
    
    doc.build(story)
    buffer.seek(0)
    
    return send_file(
        buffer,
        as_attachment=True,
        download_name=f'lab_results_{session_id[:8]}.pdf',
        mimetype='application/pdf'
    )

if __name__ == '__main__':
    # Create required directories
    os.makedirs('templates', exist_ok=True)
    os.makedirs('static', exist_ok=True)
    
    app.run(debug=True, host='0.0.0.0', port=5000)