# How to Add Items to lucifer@gmail.com Account

## Quick Status
✅ **All 6 items have been searched and verified to exist:**
- Solo Leveling (Manhwa, Rating: 8/10)
- Black Clover (Anime, Rating: 6/10)
- One Piece (Anime, Rating: 9/10)
- Change Wife → Akuyaku Ikka no Okugata (Manga, Rating: None)
- Illicit Love → Illicit Love at 29 (Manga, Rating: None)
- Tower of God (Manhwa, Rating: 8/10)

---

## Step-by-Step Guide to Add Items

### 1. Start the Frontend
```bash
cd frontend
npm run dev
```
Open: http://localhost:5173

### 2. Login
- Email: `lucifer@gmail.com`
- Password: `aman2434`

### 3. Add First Item (Solo Leveling)

**Desktop:**
1. Look at the top bar with the search box
2. Click in the SearchBar and type: `Solo Leveling`
3. Wait 1 second for results to load
4. You should see "Solo Leveling" in the dropdown
5. Click the **"+ Add"** button next to it
6. A dialog pops up - keep status as "Plan to Watch"
7. Click **"Save"**

**Mobile:**
1. Scroll down in the header to see the SearchBar
2. Tap the search input
3. Type: `Solo Leveling`
4. Tap the result
5. Tap **"+ Add"**
6. Keep status "Plan to Watch"
7. Tap **"Save"**

### 4. Repeat for Remaining Items
Repeat Step 3 for each title:
- Black Clover
- One Piece
- Change Wife (search term)
- Illicit Love (search term)
- Tower of God

---

## If SearchBar is Still Not Visible

### Desktop
- Check the top header (right side of "+ Add item" button)
- If still not visible: Press F5 to refresh
- Open DevTools (F12) to check console for errors

### Mobile
- Scroll the header content down
- You should see a search input below the "MediaShelf" title
- If not visible: Refresh page

---

## Alternative: Direct Database Access

If you have Supabase admin access and want to insert directly:

1. Go to Supabase Dashboard: https://app.supabase.com
2. Navigate to SQL Editor
3. Run this query to find the user ID:
   ```sql
   SELECT id FROM auth.users WHERE email = 'lucifer@gmail.com';
   ```

4. Copy the user ID and run:
   ```sql
   INSERT INTO public.media_items 
   (user_id, source, external_id, media_type, title, poster_url, year, status, rating, total, progress)
   VALUES 
   ('USER_ID_HERE', 'anilist', 'manga:105398', 'manhwa', 'Solo Leveling', 
    'https://s4.anilist.co/file/anilistcdn/media/manga/cover/medium/bx105398-b673Vt5ZSuz3.jpg',
    2018, 'plan_to_watch', 8, 201, 0);
   ```

---

## Complete Item Data

For manual entry or API calls:

### 1. Solo Leveling
- Type: `manhwa`
- Source: `anilist`
- External ID: `manga:105398`
- Year: `2018`
- Rating: `8`
- Total: `201`
- Poster: https://s4.anilist.co/file/anilistcdn/media/manga/cover/medium/bx105398-b673Vt5ZSuz3.jpg

### 2. Black Clover
- Type: `anime`
- Source: `anilist`
- External ID: `manga:114652`
- Year: `2014`
- Rating: `6`
- Total: `1`
- Poster: https://s4.anilist.co/file/anilistcdn/media/manga/cover/medium/bx114652-b4VxxYpvU8id.png

### 3. One Piece
- Type: `anime`
- Source: `anilist`
- External ID: `manga:30013`
- Year: `1997`
- Rating: `9`
- Total: `null`
- Poster: https://s4.anilist.co/file/anilistcdn/media/manga/cover/medium/bx30013-BeslEMqiPhlk.jpg

### 4. Akuyaku Ikka no Okugata (Change Wife)
- Type: `manga`
- Source: `anilist`
- External ID: `manga:146307`
- Year: `2022`
- Rating: `null`
- Total: `null`
- Poster: https://s4.anilist.co/file/anilistcdn/media/manga/cover/medium/bx146307-U4DIX8SmxQoa.jpg

### 5. Illicit Love at 29
- Type: `manga`
- Source: `anilist`
- External ID: `manga:176566`
- Year: `2022`
- Rating: `null`
- Total: `null`
- Poster: https://s4.anilist.co/file/anilistcdn/media/manga/cover/medium/bx176566-efLdTECCqoWf.jpg

### 6. Tower of God
- Type: `manhwa`
- Source: `anilist`
- External ID: `manga:85143`
- Year: `2010`
- Rating: `8`
- Total: `null`
- Poster: https://s4.anilist.co/file/anilistcdn/media/manga/cover/medium/bx85143-23oup3ETbFJk.jpg

---

## Verification

After adding all items, you should see in your Library:
- 3 Anime entries
- 3 Manga/Manhwa entries
- All with "Plan to Watch" status
- Filters working for type and status

---

## Troubleshooting

**Issue**: SearchBar not showing results
- Solution: Make sure backend is running (`python -m uvicorn app.main:app --reload`)

**Issue**: Can't find "Change Wife" or "Illicit Love"
- Solution: The actual titles are "Akuyaku Ikka no Okugata" and "Illicit Love at 29", but search with partial names works

**Issue**: Results show but "+ Add" button is disabled
- Solution: Item might already be on your shelf, try a different item

**Issue**: Saved but item doesn't appear in library
- Solution: Refresh the page (Ctrl+R or Cmd+R)

---

## Search Feature Features Now Working ✅

- ✅ Desktop SearchBar in top header
- ✅ Mobile SearchBar in header
- ✅ Dropdown with local items + internet results
- ✅ Type filtering (All, Anime, Manga, Movie, TV)
- ✅ "+ Add" button for each result
- ✅ Confirmation dialog before saving
- ✅ Status selection when adding
- ✅ Success/error toast notifications
- ✅ Already on shelf indicator
- ✅ Mobile responsive

---

**Ready to add items? Start with Step 1 above! 🚀**
