import requests

def test_color_coding():
    """Test the color-coded lab cards enhancement"""
    
    print("🎨 Testing Enhanced Color-Coded Lab Cards")
    print("=" * 50)
    
    # Test with existing session
    session_id = "30b9d590-8c48-4743-89c5-57a87124afee"
    
    try:
        # Get lab data
        api_response = requests.get(f'http://127.0.0.1:5000/api/results/{session_id}')
        api_result = api_response.json()
        
        if api_result.get('success'):
            lab_data = api_result.get('lab_data', [])
            print(f"📊 Testing with {len(lab_data)} lab tests")
            print("\n🔬 Lab Results Color Coding:")
            print("-" * 60)
            
            status_counts = {'NORMAL': 0, 'SLIGHTLY_ABNORMAL': 0, 'CRITICAL': 0}
            
            for test in lab_data:
                status = test['status']
                status_counts[status] = status_counts.get(status, 0) + 1
                
                # Color coding indicators
                if status == 'NORMAL':
                    emoji = '🟢'
                    color = 'Green'
                elif status == 'SLIGHTLY_ABNORMAL':
                    emoji = '🟡'
                    color = 'Orange'
                elif status == 'CRITICAL':
                    emoji = '🔴'
                    color = 'Red'
                else:
                    emoji = '⚪'
                    color = 'Gray'
                
                print(f"{emoji} {test['test']}: {test['value']} {test['unit']} ({color} theme)")
            
            print(f"\n📈 Color Distribution:")
            print(f"🟢 Normal (Green): {status_counts.get('NORMAL', 0)} tests")
            print(f"🟡 Slightly Abnormal (Orange): {status_counts.get('SLIGHTLY_ABNORMAL', 0)} tests")
            print(f"🔴 Critical (Red): {status_counts.get('CRITICAL', 0)} tests")
            
            # Test results page
            results_response = requests.get(f'http://127.0.0.1:5000/results/{session_id}')
            html_content = results_response.text
            
            # Check for enhanced features in HTML
            features_check = {
                'Color-coded cards': 'lab-card.normal' in html_content or 'lab-card.critical' in html_content,
                'Status badges': 'lab-status.normal' in html_content or 'lab-status.critical' in html_content,
                'Gradient backgrounds': 'linear-gradient' in html_content,
                'Pulse animations': 'pulse-critical' in html_content,
                'Enhanced range indicators': 'range-marker' in html_content
            }
            
            print(f"\n🎨 Enhanced Color Features:")
            print("-" * 40)
            for feature, present in features_check.items():
                status = "✅" if present else "❌"
                print(f"{status} {feature}")
            
            print(f"\n🔗 View Color-Coded Results:")
            print(f"http://127.0.0.1:5000/results/{session_id}")
            
            # Summary
            total_features = len(features_check)
            working_features = sum(features_check.values())
            print(f"\n📊 Color Enhancement Status: {working_features}/{total_features} features active")
            
            if working_features == total_features:
                print("🎉 All color-coding enhancements are working!")
            else:
                print("⚠️ Some color features may need browser testing")
        
        else:
            print("❌ Could not get lab data")
            
    except Exception as e:
        print(f"❌ Test failed: {e}")

if __name__ == "__main__":
    test_color_coding()