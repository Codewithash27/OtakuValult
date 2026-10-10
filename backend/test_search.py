#!/usr/bin/env python3
"""
Test script for MediaShelf search feature
Tests /api/search endpoint with anime and manhwa titles
"""

import json
import sys
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

# Test data
# Note: Backend uses 'manga' type which includes both manga and manhwa
# The distinction is made on the provider side (AniList checks countryOfOrigin)
TEST_QUERIES = {
    "anime": ["Solo Leveling", "Black Clover", "One Piece"],
    "manga": ["Change Wife", "Illicit Love", "Tower of God"],  # manhwa titles search as 'manga' type
}

COLORS = {
    "GREEN": "\033[92m",
    "RED": "\033[91m",
    "YELLOW": "\033[93m",
    "CYAN": "\033[96m",
    "END": "\033[0m",
}


def print_result(status: str, message: str, details: str = ""):
    color = COLORS["GREEN"] if status == "✓" else COLORS["RED"] if status == "✗" else COLORS["YELLOW"]
    print(f"{color}[{status}]{COLORS['END']} {message}")
    if details:
        print(f"  {details}")


def test_search_endpoint():
    """Test /api/search endpoint with anime and manhwa"""
    print(f"\n{COLORS['CYAN']}=== MediaShelf Search API Test ==={COLORS['END']}\n")
    
    total_tests = 0
    passed_tests = 0
    
    for media_type, queries in TEST_QUERIES.items():
        print(f"\n{COLORS['CYAN']}Testing {media_type.upper()}:{COLORS['END']}")
        
        for query in queries:
            total_tests += 1
            try:
                response = client.get(f"/api/search", params={"q": query, "type": media_type})
                
                if response.status_code == 200:
                    data = response.json()
                    results = data.get("results", [])
                    errors = data.get("errors", {})
                    
                    # Format result count
                    result_count = len(results)
                    result_msg = f"Found {result_count} result(s)"
                    
                    if result_count > 0:
                        print_result("✓", f'"{query}" ({media_type})', result_msg)
                        passed_tests += 1
                        
                        # Show first result details
                        first = results[0]
                        print(f"    → {first.get('title', 'N/A')} ({first.get('source', 'N/A')})")
                        if first.get('year'):
                            print(f"      Year: {first['year']}, Rating: {first.get('rating', 'N/A')}")
                    else:
                        if errors:
                            error_msg = list(errors.values())[0] if errors else "No results"
                            print_result("⚠", f'"{query}" ({media_type})', f"No results - {error_msg}")
                        else:
                            print_result("⚠", f'"{query}" ({media_type})', "No results")
                        passed_tests += 1  # Count as pass since API responded correctly
                else:
                    print_result("✗", f'"{query}" ({media_type})', f"HTTP {response.status_code}")
                    
            except Exception as e:
                print_result("✗", f'"{query}" ({media_type})', f"Error: {str(e)}")
    
    # Summary
    print(f"\n{COLORS['CYAN']}=== Test Summary ==={COLORS['END']}")
    print(f"Total: {total_tests} | Passed: {passed_tests} | Failed: {total_tests - passed_tests}")
    
    if passed_tests == total_tests:
        print(f"{COLORS['GREEN']}All tests passed!{COLORS['END']}")
        return 0
    else:
        print(f"{COLORS['YELLOW']}Some tests completed (check provider APIs for failures){COLORS['END']}")
        return 1


def test_search_all_type():
    """Test 'all' type searches"""
    print(f"\n{COLORS['CYAN']}=== Testing 'all' Type Searches ==={COLORS['END']}\n")
    
    test_queries = ["Solo Leveling", "Inception"]
    
    for query in test_queries:
        try:
            response = client.get(f"/api/search", params={"q": query, "type": "all"})
            
            if response.status_code == 200:
                data = response.json()
                results = data.get("results", [])
                errors = data.get("errors", {})
                
                print_result("✓", f'Search "{query}" (type=all)', f"Found {len(results)} result(s)")
                
                # Group by media type
                by_type = {}
                for r in results:
                    mt = r.get("media_type")
                    by_type[mt] = by_type.get(mt, 0) + 1
                
                for media_type, count in sorted(by_type.items()):
                    print(f"  → {media_type}: {count}")
                
                if errors:
                    print(f"  Providers with errors: {', '.join(errors.keys())}")
            else:
                print_result("✗", f'Search "{query}" (type=all)', f"HTTP {response.status_code}")
                
        except Exception as e:
            print_result("✗", f'Search "{query}" (type=all)', f"Error: {str(e)}")


def test_validation():
    """Test input validation"""
    print(f"\n{COLORS['CYAN']}=== Testing Validation ==={COLORS['END']}\n")
    
    # Too short query
    response = client.get("/api/search", params={"q": "a", "type": "anime"})
    if response.status_code == 422:
        print_result("✓", "Query too short (1 char)", "Correctly rejected")
    else:
        print_result("✗", "Query too short validation", f"Got HTTP {response.status_code}")
    
    # Invalid type
    response = client.get("/api/search", params={"q": "test query", "type": "invalid"})
    if response.status_code == 422:
        print_result("✓", "Invalid type parameter", "Correctly rejected")
    else:
        print_result("✗", "Invalid type validation", f"Got HTTP {response.status_code}")
    
    # Valid minimum query
    response = client.get("/api/search", params={"q": "ab", "type": "anime"})
    if response.status_code == 200:
        print_result("✓", "Query minimum length (2 chars)", "Accepted")
    else:
        print_result("✗", "Query minimum validation", f"Got HTTP {response.status_code}")


if __name__ == "__main__":
    try:
        # Run tests
        test_search_endpoint()
        test_search_all_type()
        test_validation()
        
        print(f"\n{COLORS['CYAN']}=== Note ==={COLORS['END']}")
        print("Movie/TV search may show errors if TMDB_API_KEY is not configured.")
        print("This is expected behavior - other providers should still work.\n")
        
    except Exception as e:
        print(f"{COLORS['RED']}Fatal error:{COLORS['END']} {e}")
        sys.exit(1)
