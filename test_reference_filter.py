# Test script for reference filtering logic
import sys
import os

# Set UTF-8 encoding for stdout to handle Unicode characters
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')

# Add the parent directory to the path to import the service
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.reference_service import ReferenceService

def test_reference_filtering():
    """Test the reference filtering logic with sample data."""
    
    # Sample references in both formats
    sample_references = """- Character Name: 七修 -> Seven Cultivator [Male]
- Character Name: 三浪 -> Three Waves [Male]
- Character Name: 宋书航 -> Song Shuhang [Male]
- エド -> Ed [Male]
- エマ -> Emma [Female]
- カイル -> Kyle [Male]
- 高瀬誠司 -> Seiji Takase [Male]"""
    
    # Test case 1: Input text contains some terms
    input_text_1 = "宋书航 went to meet エド and エマ at the shop."
    
    # Test case 2: Input text contains no matching terms
    input_text_2 = "This is a random text with no character names."
    
    # Test case 3: Input text contains only one term
    input_text_3 = "カイル is the main character."
    
    # Create a reference service instance
    ref_service = ReferenceService()
    
    print("=" * 60)
    print("TEST 1: Input with multiple matching terms")
    print("=" * 60)
    print(f"Input text: {input_text_1}")
    print(f"\nFiltered references:")
    filtered_1 = ref_service._filter_references(sample_references, input_text_1)
    print(filtered_1 if filtered_1 else "(No matches found)")
    print()
    
    print("=" * 60)
    print("TEST 2: Input with no matching terms")
    print("=" * 60)
    print(f"Input text: {input_text_2}")
    print(f"\nFiltered references:")
    filtered_2 = ref_service._filter_references(sample_references, input_text_2)
    print(filtered_2 if filtered_2 else "(No matches found)")
    print()
    
    print("=" * 60)
    print("TEST 3: Input with single matching term")
    print("=" * 60)
    print(f"Input text: {input_text_3}")
    print(f"\nFiltered references:")
    filtered_3 = ref_service._filter_references(sample_references, input_text_3)
    print(filtered_3 if filtered_3 else "(No matches found)")
    print()
    
    print("=" * 60)
    print("TEST 4: Test with actual reference file")
    print("=" * 60)
    # Test with the actual 45 Years Old Rebuild Territory reference file
    title = "45 Years Old Rebuild Territory"
    test_input = "エド met エマ in the village."
    
    try:
        full_refs = ref_service.load_references(title)
        print(f"Full reference file has {len(full_refs)} characters")
        print(f"\nTest input: {test_input}")
        
        filtered_refs = ref_service._filter_references(full_refs, test_input)
        print(f"\nFiltered references:")
        print(filtered_refs if filtered_refs else "(No matches found)")
        print(f"\nFiltered references has {len(filtered_refs)} characters")
        print(f"Token reduction: {len(full_refs) - len(filtered_refs)} characters saved")
    except Exception as e:
        print(f"Error loading reference file: {e}")
    
    print()
    print("=" * 60)
    print("All tests completed!")
    print("=" * 60)

if __name__ == "__main__":
    test_reference_filtering()
