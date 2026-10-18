# تشكيل الأحاديث (data/tsk.json)

1. `shamela.yml` (workflow) downloads Shamela pages as they are, a branch per run: `sh-<book>-<first page>`.
2. `getbook.sh <book>` gathers a book's pages; `corpus.py <book> <dir>` makes its word list (marks kept).
3. `glyph_fill.py`, then `invariant.py`, then `build_tsk.py 711,1681,1726,1435,829,1198,9111,2348,700,1727,735 all`.
4. `verify2.py` checks every entry independently; `units2.py` gives the coverage of the hadith texts; `conflicts2.py` compares with the other edition of the same book.

Books: 1681 Bukhari (Sultaniyya), 735 Bukhari (al-Bugha), 711 Muslim (Turkish), 1727 Muslim (Abd al-Baqi), 1726 Abu Dawud, 1435 Tirmidhi, 829 Nasa'i, 1198 Ibn Majah, 9111 Bulugh, 2348 Riyad, 700 Mukhtasar al-Shamail.
