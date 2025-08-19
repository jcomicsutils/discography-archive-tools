import sys
import datetime
import json
import logging
import re
import argparse
import os
import hashlib
import shutil
import time
import random
import html
from typing import Union, List, Optional
from urllib.parse import urljoin, urlparse, urlunparse
import bs4
import demjson3
import requests
from requests.adapters import HTTPAdapter
from urllib3.util import create_urllib3_context


class SSLAdapter(HTTPAdapter):
    def __init__(self, ssl_context=None, **kwargs):
        self.ssl_context = ssl_context
        super().__init__(**kwargs)

    def init_poolmanager(self, *args, **kwargs):
        kwargs['ssl_context'] = self.ssl_context
        return super().init_poolmanager(*args, **kwargs)

    def proxy_manager_for(self, *args, **kwargs):
        kwargs['ssl_context'] = self.ssl_context
        return super().proxy_manager_for(*args, **kwargs)

class BandcampJSON:
    def __init__(self, body, debugging: bool = False):
        self.body = body
        self.json_data = []
        self.logger = logging.getLogger("bandcamp-dl").getChild("JSON")

    def generate(self):
        self.get_pagedata()
        self.get_js()
        return self.json_data

    def get_pagedata(self):
        self.logger.debug(" Grab pagedata JSON..")
        pagedata_div = self.body.find('div', {'id': 'pagedata'})
        if pagedata_div:
            pagedata = pagedata_div.get('data-blob')
            if pagedata:
                self.json_data.append(pagedata)

    def get_js(self):
        self.logger.debug(" Grabbing embedded scripts..")
        embedded_scripts_raw = []
        ld_json_script = self.body.find("script", {"type": "application/ld+json"})
        if ld_json_script and ld_json_script.string:
             embedded_scripts_raw.append(ld_json_script.string)

        for script in self.body.find_all('script'):
            if script.has_attr('data-tralbum'):
                album_info = script['data-tralbum']
                embedded_scripts_raw.append(album_info)

        for script in embedded_scripts_raw:
            js_data = self.js_to_json(script)
            self.json_data.append(js_data)

    def js_to_json(self, js_data):
        self.logger.debug(" Converting JS to JSON..")
        try:
            decoded_js = demjson3.decode(js_data)
            return demjson3.encode(decoded_js)
        except demjson3.JSONDecodeError as e:
            self.logger.error(f"Failed to decode JS to JSON: {e}")
            return "{}"


class Bandcamp:
    def __init__(self, delay_arg=None, retries=5, retry_delay=5):
        self.headers = {'User-Agent': f'discography-archive-tools/1.0 (https://github.com/jcomicsutils/discography-archive-tools)'}
        self.soup = None
        self.tracks = None
        self.logger = logging.getLogger("bandcamp-dl").getChild("Main")
        self.delay_arg = delay_arg
        self.max_retries = retries
        self.retry_delay = retry_delay
        
        ctx = create_urllib3_context()
        ctx.load_default_certs()
        DEFAULT_CIPHERS = ":".join([
            "ECDHE+AESGCM", "ECDHE+CHACHA20", "DHE+AESGCM", "DHE+CHACHA20",
            "ECDH+AESGCM", "DH+AESGCM", "ECDH+AES", "DH+AES", "RSA+AESGCM",
            "RSA+AES", "!aNULL", "!eNULL", "!MD5", "!DSS", "!AESCCM",
        ])
        ctx.set_ciphers(DEFAULT_CIPHERS)
        self.session = requests.Session()
        self.adapter = SSLAdapter(ssl_context=ctx)
        self.session.mount('https://', self.adapter)

    def _apply_delay(self):
        if not self.delay_arg:
            return
        
        min_delay_ms, max_delay_ms = 1000, 3000
        delay_str = str(self.delay_arg)

        if '-' in delay_str:
            try:
                parts = delay_str.split('-')
                min_delay_ms = float(parts[0])
                max_delay_ms = float(parts[1])
            except (ValueError, IndexError):
                self.logger.warning(f"Invalid delay range '{self.delay_arg}'. Using {min_delay_ms}-{max_delay_ms} ms.")
        else:
            try:
                min_delay_ms = max_delay_ms = float(delay_str)
            except ValueError:
                self.logger.warning(f"Invalid delay value '{self.delay_arg}'. Using 1000 ms.")
                min_delay_ms = max_delay_ms = 1000

        if min_delay_ms < 0 or max_delay_ms < 0 or max_delay_ms < min_delay_ms:
            self.logger.warning(f"Invalid delay values. Using 1000-3000 ms.")
            min_delay_ms, max_delay_ms = 1000, 3000

        sleep_time_ms = random.uniform(min_delay_ms, max_delay_ms)
        self.logger.info(f"Delaying for {sleep_time_ms:.2f} ms...")
        time.sleep(sleep_time_ms / 1000) # time.sleep expects seconds

    def _session_get(self, *args, **kwargs):
        self._apply_delay()
        
        last_exception = None
        
        for attempt in range(self.max_retries + 1):
            try:
                response = self.session.get(*args, **kwargs)
                
                if response.status_code == 429:
                    if attempt < self.max_retries:
                        wait_time = self.retry_delay * (attempt + 1)
                        self.logger.warning(
                            f"Rate limited (HTTP 429). Retrying in {wait_time} seconds... (Attempt {attempt + 1}/{self.max_retries})"
                        )
                        time.sleep(wait_time)
                        continue
                    else:
                        self.logger.error("Max retries reached for rate limiting.")
                        response.raise_for_status()

                response.raise_for_status() 
                return response
            
            except requests.exceptions.RequestException as e:
                last_exception = e
                if attempt < self.max_retries:
                    wait_time = self.retry_delay * (attempt + 1)
                    self.logger.warning(f"Request failed ({e}). Retrying in {wait_time} seconds... (Attempt {attempt + 1}/{self.max_retries})")
                    time.sleep(wait_time)
                else:
                    self.logger.error("Max retries reached after connection errors.")
                    raise last_exception 

        if last_exception:
            raise last_exception
        raise requests.exceptions.RequestException("Request failed after all retries.")

    def get_album_urls_from_artist_page(self, artist_url: str) -> List[str]:
        album_urls = set()
        
        parsed_url = urlparse(artist_url)
        if not parsed_url.path or parsed_url.path == "/":
            music_page_url = urlunparse(parsed_url._replace(path="/music"))
        else:
            music_page_url = artist_url

        self.logger.info(f"Scraping discography from: {music_page_url}")
        
        try:
            response = self._session_get(music_page_url, headers=self.headers)
        except requests.exceptions.RequestException as e:
            self.logger.error(f"Could not fetch artist page {music_page_url}: {e}")
            return []

        try:
            soup = bs4.BeautifulSoup(response.text, "lxml")
        except bs4.FeatureNotFound:
            soup = bs4.BeautifulSoup(response.text, "html.parser")
            
        music_grid = soup.find('ol', {'id': 'music-grid'})
        if not music_grid:
            self.logger.warning("Could not find music grid on the page. No albums found.")
            return []

        if 'data-client-items' in music_grid.attrs:
            self.logger.debug("Found data-client-items attribute. Parsing for album URLs.")
            try:
                json_string = music_grid['data-client-items'] # html.unescape(music_grid['data-client-items'])
                items = json.loads(json_string)
                for item in items:
                    if 'page_url' in item:
                        full_url = urljoin(music_page_url, item['page_url'])
                        album_urls.add(full_url)
            except (json.JSONDecodeError, TypeError) as e:
                self.logger.error(f"Failed to parse data-client-items JSON: {e}")
        
        self.logger.debug("Scraping all <li> elements in the music grid for links.")
        for a in music_grid.select('li.music-grid-item a'):
            href = a.get('href')
            if href:
                full_url = urljoin(music_page_url, href)
                album_urls.add(full_url)

        self.logger.info(f"Found a total of {len(album_urls)} unique album/track links.")
        return list(album_urls)


    def parse(self, url: str, fetch_track_art: bool = False, debugging: bool = False) -> Union[dict, None]:
        try:
            response = self._session_get(url, headers=self.headers)
        except requests.exceptions.RequestException as e:
            self.logger.error(f"Request failed for {url} after all retries: {e}")
            return None

        try:
            self.soup = bs4.BeautifulSoup(response.text, "lxml")
        except bs4.FeatureNotFound:
            self.soup = bs4.BeautifulSoup(response.text, "html.parser")

        self.logger.debug(" Generating BandcampJSON..")
        bandcamp_json = BandcampJSON(self.soup, debugging).generate()
        
        page_json = {}
        for entry in bandcamp_json:
            try:
                page_json.update(json.loads(entry))
            except json.JSONDecodeError:
                self.logger.warning(f"Could not decode JSON entry: {entry}")
        self.logger.debug(" BandcampJSON generated..")

        if not page_json.get('trackinfo'):
            self.logger.error(f"Could not find track info JSON on {url}. It might not be a track/album page.")
            page_json['trackinfo'] = []


        self.logger.debug(" Generating Album..")
        self.tracks = page_json['trackinfo']

        album_release = page_json.get('album_release_date')
        if album_release is None:
            current_data = page_json.get('current', {})
            album_release = current_data.get('release_date')
            if album_release is None:
                embed_info = page_json.get('embed_info', {})
                album_release = embed_info.get('item_public')
        
        album_title = page_json.get('current', {}).get('title')
        if not album_title:
             try:
                 album_title = page_json['trackinfo'][0]['title']
             except (IndexError, KeyError, TypeError):
                 ld_json_script = self.soup.find("script", {"type": "application/ld+json"})
                 if ld_json_script and ld_json_script.string:
                     try:
                         ld_json = json.loads(ld_json_script.string)
                         album_title = ld_json.get('name', 'Untitled')
                     except json.JSONDecodeError:
                         album_title = 'Untitled'
                 else:
                    album_title = 'Untitled'
        
        album_art_url = self.get_art_from_page(self.soup)
        album_artist = page_json.get('artist', 'Unknown Artist')
        album_label = self.get_label_from_html(self.soup, page_json)

        album = {
            "url": url,
            "title": album_title,
            "artist": album_artist,
            "label": album_label,
            "classification": self.get_classification(page_json),
            "tags": page_json.get('keywords', []),
            "item_id": page_json.get('current', {}).get('id'),
            "art_id": page_json.get('art_id'),
            "is_preorder": page_json.get('is_preorder'),
            "datePublished": album_release,
            "about": self.get_about_from_html(),
            "credits": self.get_credits_from_html(),
            "license": self.get_license_from_html(self.soup),
            "coverUrl_0": album_art_url.replace(".jpg", ""), # Match JS format
            "trackinfo": []
        }
        
        base_url = urlparse(url)._replace(query="", fragment="").geturl()

        for i, track_data in enumerate(self.tracks):
            if track_data.get('file'): 
                if fetch_track_art:
                    print(f"    -> Processing track {i+1}/{len(self.tracks)}: {track_data.get('title')}")
                album['trackinfo'].append(self.get_track_metadata(track_data, album_art_url, base_url, fetch_track_art, album_artist, album_label))

        return album

    def get_classification(self, page_json: dict) -> Union[str, None]:
        try:
            nyp_element = self.soup.find('span', class_='buyItemExtra buyItemNyp secondaryText')
            if nyp_element and ('name your price' in nyp_element.text.lower() or '値段を決めて下さい' in nyp_element.text):
                return 'nyp'

            free_download_button = self.soup.select_one('h4.ft.compound-button.main-button button.download-link.buy-link')
            if free_download_button and ('free download' in free_download_button.text.lower() or '無料ダウンロード' in free_download_button.text.lower()):
                return 'free'
                
            is_free_download = False
            if page_json.get('trackinfo'):
                for track in page_json['trackinfo']:
                    if track.get('free_album_download'):
                        is_free_download = True
                        break
            
            if is_free_download:
                return 'free'

            if page_json.get('current', {}).get('minimum_price') == 0:
                return 'nyp'

        except Exception as e:
            self.logger.warning(f"Could not determine classification: {e}")
        
        return 'paid' 

    def _get_text_with_linebreaks(self, element: bs4.element.Tag) -> Union[str, None]:
        if not element:
            return None

        for br in element.find_all("br"):
            br.replace_with("<<BR>>")

        text_with_placeholders = element.get_text()
        
        cleaned_text = re.sub(r'(\n\s*)+', ' ', text_with_placeholders)

        lines = [line.strip() for line in cleaned_text.split("<<BR>>")]
        
        non_empty_lines = [line for line in lines if line]
        
        return "\n".join(non_empty_lines)

    def get_about_from_html(self) -> Union[str, None]:
        about_div = self.soup.select_one('.tralbumData.tralbum-about')
        return self._get_text_with_linebreaks(about_div)

    def get_credits_from_html(self) -> Union[str, None]:
        credits_div = self.soup.select_one('.tralbumData.tralbum-credits')
        return self._get_text_with_linebreaks(credits_div)
    
    def get_license_from_html(self, soup_object: bs4.BeautifulSoup) -> Union[str, None]:
        try:
            license_div = soup_object.select_one('#license.info.license')
            if license_div:
                icon_span = license_div.find('span')
                if icon_span:
                    icon_span.decompose()
                return license_div.text.strip()
        except Exception as e:
            self.logger.warning(f"Could not extract license text: {e}")
        return None

    def get_label_from_html(self, soup_object: bs4.BeautifulSoup, page_json: dict) -> Union[str, None]:
        try:
            label_link = soup_object.select_one('a.back-to-label-link span.back-link-text')
            if label_link:
                return label_link.get_text(separator='\n').split('\n')[-1].strip()
        except Exception as e:
            self.logger.warning(f"Could not extract label from HTML: {e}")
        
        return page_json.get('item_sellers', {}).get(str(page_json.get("band_id")), {}).get('name')

    def get_track_metadata(self, track: dict, album_art_url: str, base_url: str, fetch_track_art: bool, album_artist: str, album_label: str) -> dict:
        self.logger.debug(" Generating track metadata..")
        
        duration_seconds = track.get('duration', 0)
        
        if duration_seconds >= 3600:
            hours = int(duration_seconds // 3600)
            minutes = int((duration_seconds % 3600) // 60)
            seconds = int(duration_seconds % 60)
            duration_str = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
        else:
            minutes = int(duration_seconds // 60)
            seconds = int(duration_seconds % 60)
            duration_str = f"{minutes:02d}:{seconds:02d}"

        track_num = track.get('track_num')
        lyrics_text = None
        if track_num:
            lyrics_row = self.soup.select_one(f'tr#lyrics_row_{track_num} div')
            if lyrics_row:
                lyrics_text = self._get_text_with_linebreaks(lyrics_row)
        
        track_title = track.get('title', 'Untitled Track')
        track_artist = track.get('artist')

        if track_artist and track_title.startswith(f"{track_artist} - "):
            track_title = track_title[len(track_artist) + 3:]
        
        if track_artist is None:
            track_artist = album_artist
        
        track_page_link = track.get('title_link')
        full_track_url = urljoin(base_url, track_page_link) if track_page_link else None

        track_metadata = {
            "title": track_title,
            "duration": duration_str,
            "lyrics": lyrics_text,
            "label": album_label, 
            "track_id": track.get('id'),
            "track_num": str(track.get('track_num', 'N/A')),
            "artist": track_artist, 
            "url": full_track_url
        }
        
        if fetch_track_art:
            track_cover_url = album_art_url 
            track_art_id = None
            track_about = None
            track_credits = None
            track_license = None
            if full_track_url:
                try:
                    track_page_response = self._session_get(full_track_url, headers=self.headers)
                    if track_page_response.ok:
                        track_soup = bs4.BeautifulSoup(track_page_response.text, "lxml")
                        specific_art = self.get_art_from_page(track_soup)
                        if specific_art != "Album art not found":
                            track_cover_url = specific_art
                        
                        track_page_json_data = BandcampJSON(track_soup).generate()
                        track_page_json = {}
                        for entry in track_page_json_data:
                            track_page_json.update(json.loads(entry))
                        track_art_id = track_page_json.get('art_id')
                        
                        about_div = track_soup.select_one('.tralbumData.tralbum-about')
                        track_about = self._get_text_with_linebreaks(about_div)

                        credits_div = track_soup.select_one('.tralbumData.tralbum-credits')
                        track_credits = self._get_text_with_linebreaks(credits_div)
                        
                        track_license = self.get_license_from_html(track_soup)
                        
                        track_label = self.get_label_from_html(track_soup, track_page_json)
                        if track_label:
                            track_metadata["label"] = track_label


                except Exception as e:
                    self.logger.warning(f"Failed to fetch individual page for track '{track_title}': {e}")
            
            track_metadata["trackCoverUrl_0"] = track_cover_url.replace(".jpg", "")
            track_metadata["art_id"] = track_art_id
            track_metadata["about"] = track_about
            track_metadata["credits"] = track_credits
            track_metadata["license"] = track_license

        return track_metadata

    def get_art_from_page(self, soup_object: bs4.BeautifulSoup) -> str:
        try:
            art_link = soup_object.find(id='tralbumArt').find('a')
            if art_link and art_link.has_attr('href'):
                url = art_link['href']
                base_url, extension = url.rsplit('.', 1)
                if '_' in base_url:
                    parts = base_url.rsplit('_', 1)
                    if parts[1].isdigit():
                        return f"{parts[0]}_0.{extension}"
                return url
        except (AttributeError, IndexError):
            self.logger.warning("Could not find album art on the page.")
            return "Album art not found"
        return "Album art not found"

    def get_album_art(self) -> str:
        return self.get_art_from_page(self.soup)

def get_bandcamp_data(url: str, fetch_track_art: bool, bandcamp_parser: Bandcamp) -> Union[dict, None]:
    album_data = bandcamp_parser.parse(url, fetch_track_art=fetch_track_art)
    return album_data

def create_safe_filename(name: str) -> str:
    clean_name = re.sub(r'[\x00-\x1f\x7f\u200b-\u200d\ufeff]', '', name)
    
    clean_name = clean_name.replace(' | ', ' - ')
    
    clean_name = re.sub(r'[\\/?%*:|"<>]+', '-', clean_name)
    
    clean_name = re.sub(r' +', ' ', clean_name)
    
    clean_name = re.sub(r'^\.+', '', clean_name)
    
    clean_name = re.sub(r'-+', '-', clean_name)

    clean_name = clean_name.strip()
    
    while clean_name and (clean_name.endswith('.') or clean_name.endswith(' ')):
        clean_name = clean_name[:-1]

    return f"{clean_name}"

def create_and_truncate_filename(artist, title, item_id, is_track=False, track_info=None):
    max_len = 100
    target_len = 95
    ellipsis = "(...)"

    safe_title = title.replace("{", "{{").replace("}", "}}")
    safe_artist = artist.replace("{", "{{").replace("}", "}}") if artist else None

    if is_track and track_info:
        track_num = track_info.get('num')
        track_artist = track_info.get('artist', '').replace("{", "{{").replace("}", "}}")
        template = f"{track_num} - {track_artist} - {{title}} [{item_id}]"
    else:
        template = f"{safe_artist} - {{title}} [{item_id}]"

    full_filename_check = template.format(title=safe_title)

    if len(full_filename_check) > max_len:
        len_of_template_without_placeholder = len(template.replace('{title}', ''))
        available_len_for_title = target_len - len_of_template_without_placeholder - len(ellipsis)
        
        if available_len_for_title < 0:
            available_len_for_title = 0
            
        truncated_title = title[:available_len_for_title]
        final_title_escaped = f"{truncated_title.replace('{', '{{').replace('}', '}}')}{ellipsis}"
        final_filename_str = template.format(title=final_title_escaped)
    else:
        final_filename_str = template.format(title=safe_title)

    return create_safe_filename(final_filename_str)

def save_data_to_json(data: Union[dict, list], filename: str):
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4, ensure_ascii=False)
        print(f"--- Successfully saved data to {filename} ---")
    except IOError as e:
        print(f"--- Error: Could not save data to {filename}. Reason: {e} ---")
    except TypeError as e:
        print(f"--- Error: Could not serialize data to JSON. Reason: {e} ---")

def save_url_list(urls: List[str], filename: str):
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            if urls:
                content = '\n'.join(urls)
                f.write(content + '\n')
        print(f"--- Successfully saved URL list to {filename} ---")
    except IOError as e:
        print(f"--- Error: Could not save URL list to {filename}. Reason: {e} ---")

def save_removed_log(log_entries: List[str], filename: str):
    if not log_entries:
        return
    try:
        with open(filename, 'w', encoding='utf-8') as f:
            content = '\n\n'.join(log_entries)
            f.write(content + '\n')
        print(f"--- Logged removed URLs to {filename} ---")
    except IOError as e:
        print(f"--- Error: Could not save removed log to {filename}. Reason: {e} ---")

def is_artist_page(url: str) -> bool:
    parsed_url = urlparse(url)
    return parsed_url.path in ["", "/", "/music", "/music/"]

def calculate_md5(filepath: str) -> str:
    hash_md5 = hashlib.md5()
    try:
        with open(filepath, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest()
    except IOError as e:
        print(f"    -> Could not read file {filepath} to calculate hash. Error: {e}")
        return ""

def get_extension_from_mime_type(mime_type: str) -> str:
    if not mime_type:
        return 'jpg'
    mime_map = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp'
    }
    return mime_map.get(mime_type.lower(), 'jpg')

def get_high_res_url(image_url: str) -> Optional[str]:
    if not image_url or not re.search(r'_\d+\.', image_url):
        return None
    return re.sub(r'_\d+(\.\w+)$', r'_0\1', image_url)

def download_image(image_url: str, folder_path: str, base_filename: str, bandcamp_parser: Bandcamp):
    if not image_url or "Album art not found" in image_url:
        return
        
    try:
        response = bandcamp_parser._session_get(image_url, stream=True)
        response.raise_for_status()
        
        content_type = response.headers.get('content-type')
        extension = get_extension_from_mime_type(content_type)
        
        filename = f"{base_filename}.{extension}"
        filepath = os.path.join(folder_path, filename)

        with open(filepath, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        print(f"    -> Downloaded image: {filename}")
    except requests.exceptions.RequestException as e:
        print(f"    -> Failed to download image {image_url}. Error: {e}")

def download_artist_images(page_url: str, soup: bs4.BeautifulSoup, artist_folder_path: str, bandcamp_parser: Bandcamp, index: int):
    profile_img_tag = soup.select_one('div.bio-pic a.popupImage')
    if profile_img_tag and profile_img_tag.get('href'):
        profile_img_url = urljoin(page_url, profile_img_tag['href'])
        hq_profile_url = get_high_res_url(profile_img_url) or profile_img_url
        print(f"  -> Found artist profile image: {hq_profile_url}")
        download_image(hq_profile_url, artist_folder_path, f"Artist Photo_orig ({index})", bandcamp_parser)

    banner_img_tag = soup.select_one('#customHeader img')
    if banner_img_tag and banner_img_tag.get('src'):
        banner_img_url = urljoin(page_url, banner_img_tag['src'])
        hq_banner_url = get_high_res_url(banner_img_url) or banner_img_url
        print(f"  -> Found artist banner image: {hq_banner_url}")
        download_image(hq_banner_url, artist_folder_path, f"Custom Header_orig ({index})", bandcamp_parser)

    bg_img_url = None
    body_tag = soup.find('body')
    if body_tag and body_tag.get('style'):
        style = body_tag['style']
        match = re.search(r'background-image:\s*url\((.*?)\)', style)
        if match:
            bg_img_url = match.group(1).strip('\'"')

    if not bg_img_url:
        style_tag = soup.find('style', id='custom-design-rules-style')
        if style_tag and style_tag.string:
            match = re.search(r'body\s*\{[^}]*?background-image:\s*url\(([^)]+)\)', style_tag.string, re.DOTALL)
            if match:
                bg_img_url = match.group(1).strip('\'"')

    if bg_img_url:
        bg_img_url = urljoin(page_url, bg_img_url)
        hq_bg_url = get_high_res_url(bg_img_url) or bg_img_url
        print(f"  -> Found artist background image: {hq_bg_url}")
        download_image(hq_bg_url, artist_folder_path, f"Background Image ({index})", bandcamp_parser)

def process_album_covers(album_data, base_cover_folder, bandcamp_parser: Bandcamp, fetch_track_art, downloaded_covers, hash_covers):
    if not album_data or not base_cover_folder:
        return

    artist = album_data.get('artist', 'Unknown_Artist')
    title = album_data.get('title', 'Untitled')
    item_id = album_data.get('item_id')
    album_art_id = album_data.get('art_id')
    album_cover_url = album_data.get("coverUrl_0", "") + ".jpg"
    tracks = album_data.get("trackinfo", [])

    has_unique_track_covers = False
    if fetch_track_art:
        for track in tracks:
            if track.get('art_id') and track.get('art_id') != album_art_id:
                has_unique_track_covers = True
                break  

    target_folder = base_cover_folder
    if has_unique_track_covers:
        album_specific_folder_name = create_and_truncate_filename(artist, title, item_id)
        target_folder = os.path.join(base_cover_folder, album_specific_folder_name)
        os.makedirs(target_folder, exist_ok=True)
        print(f"  -> Album has unique track covers. Saving all covers to: {target_folder}")

    if album_cover_url and "Album art not found" not in album_cover_url and album_cover_url not in downloaded_covers:
        album_filename_base = create_and_truncate_filename(artist, title, item_id)
        download_image(album_cover_url, target_folder, album_filename_base, bandcamp_parser)
        downloaded_covers.add(album_cover_url)

    if has_unique_track_covers:
        for track in tracks:
            hq_track_art_id = track.get('art_id')

            if hq_track_art_id and hq_track_art_id != album_art_id:
                try:
                    hq_track_art_url = f"https://f4.bcbits.com/img/a{hq_track_art_id}_0.jpg"
                    if hq_track_art_url not in downloaded_covers:
                        track_title = track.get('title', 'Untitled Track')
                        track_id = track.get('track_id')
                        track_info_for_name = {'num': track.get('track_num', 'NA'), 'artist': track.get('artist', 'Unknown_Artist')}
                        track_filename_base = create_and_truncate_filename(None, track_title, track_id, is_track=True, track_info=track_info_for_name)
                        
                        download_image(hq_track_art_url, target_folder, track_filename_base, bandcamp_parser)
                        downloaded_covers.add(hq_track_art_url)
                except Exception as e:
                    logging.error(f"Failed to process unique track art for '{track.get('title')}': {e}")

    if has_unique_track_covers and hash_covers:
        print(f"  -> Hashing and de-duplicating covers in: {target_folder}")
        hashes = {}
        files_to_delete = []
        
        image_files = sorted([os.path.join(target_folder, f) for f in os.listdir(target_folder) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.gif'))])

        for filepath in image_files:
            file_hash = calculate_md5(filepath)
            if not file_hash: continue
            if file_hash in hashes:
                files_to_delete.append(filepath)
            else:
                hashes[file_hash] = filepath
        
        for f in files_to_delete:
            try:
                os.remove(f)
                print(f"    -> Deleted duplicate cover: {os.path.basename(f)}")
            except OSError as e:
                print(f"    -> Error deleting file {f}: {e}")

        if len(hashes) == 1:
            print(f"  -> All covers in subfolder are identical. Consolidating and cleaning up.")
            try:
                remaining_filepath = list(hashes.values())[0]
                
                album_filename_base = create_and_truncate_filename(artist, title, item_id)
                extension = os.path.splitext(remaining_filepath)[1]
                destination_path = os.path.join(base_cover_folder, album_filename_base + extension)

                if os.path.exists(destination_path):
                    os.remove(remaining_filepath)
                else:
                    shutil.move(remaining_filepath, destination_path)
                
                print(f"    -> Consolidated cover to: {os.path.basename(destination_path)}")

                os.rmdir(target_folder)
                print(f"    -> Removed empty subfolder: {os.path.basename(target_folder)}")

            except (IOError, OSError, shutil.Error) as e:
                print(f"    -> Error during consolidation: {e}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Fetch and parse data from a Bandcamp URL.")
    parser.add_argument("urls", nargs='+', help="One or more Bandcamp URLs to process.")
    parser.add_argument("-t", "--track-art", action="store_true", help="Fetch individual track cover art, about, and credits (slower).")
    parser.add_argument("-cd", "--cover-download", action="store_true", help="Download album/track covers and artist images (profile, banner, background).")
    parser.add_argument("-d", "--debug", action="store_true", help="Enable verbose debug logging.")
    parser.add_argument("-H", "--hash-covers", action="store_true", help="When downloading unique track art, verify uniqueness using MD5 hashes and remove duplicates.")
    parser.add_argument("-sl", "--save-list", action="store_true", help="Save a list of all found URLs to a file named 'bandcamp-dump.lst'.")
    parser.add_argument("-dl", "--delay", type=str, help="Add a delay between requests in milliseconds. Use a single number (e.g., '2000') for a fixed delay, or a range (e.g., '1000-5000') for a random delay between min and max milliseconds.")
    parser.add_argument("-r", "--retries", type=int, default=5, help="Set the maximum number of retries for a failed request (default: 5).")
    parser.add_argument("-rd", "--retry-delay", type=int, default=5, help="Set the initial delay in seconds before retrying a failed request. This will be multiplied by the attempt number (default: 5).")
    args = parser.parse_args()

    log_level = logging.DEBUG if args.debug else logging.INFO
    logging.basicConfig(level=log_level, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')

    if not args.urls:
        parser.print_help()
        sys.exit(0)

    fetch_track_art = args.track_art
    cover_download = args.cover_download
    hash_covers = args.hash_covers
    bandcamp_parser = Bandcamp(delay_arg=args.delay, retries=args.retries, retry_delay=args.retry_delay)

    all_album_urls = set()
    for url_to_fetch in args.urls:
        if is_artist_page(url_to_fetch):
            print(f"Discovering releases on artist page: {url_to_fetch}")
            album_urls_from_page = bandcamp_parser.get_album_urls_from_artist_page(url_to_fetch)
            all_album_urls.update(album_urls_from_page)
        else:
            all_album_urls.add(url_to_fetch)

    unique_album_urls = sorted(list(all_album_urls))

    if not unique_album_urls:
        print("No album/track URLs could be found from the provided inputs.")
        sys.exit(0)

    primary_artist_name = 'Unknown_Artist' 
    first_cli_url = args.urls[0]
    print(f"\n--- Determining primary artist from the first provided URL: {first_cli_url} ---")
    try:
        response = bandcamp_parser._session_get(first_cli_url, headers=bandcamp_parser.headers)
        try:
            soup = bs4.BeautifulSoup(response.text, "lxml")
        except bs4.FeatureNotFound:
            soup = bs4.BeautifulSoup(response.text, "html.parser")
        
        band_name_element = soup.select_one('p#band-name-location span.title')
        
        if band_name_element and band_name_element.text:
            primary_artist_name = band_name_element.text.strip()
            print(f"Determined primary artist from HTML: {primary_artist_name}")
        else:
            print("Could not find artist name in '#band-name-location' block. Falling back to parsing the page content.")
            fallback_url = unique_album_urls[0] if unique_album_urls else first_cli_url
            first_album_data = bandcamp_parser.parse(fallback_url, fetch_track_art=False)
            if first_album_data and first_album_data.get('artist'):
                primary_artist_name = first_album_data.get('artist')
                print(f"Determined primary artist via page parse fallback: {primary_artist_name}")
            else:
                 print("Fallback method also failed. Using 'Unknown_Artist'.")

    except requests.exceptions.RequestException as e:
        print(f"Fatal: Could not fetch the first URL to determine the primary artist: {e}. Exiting.")
        sys.exit(1)
    except Exception as e:
        print(f"An unexpected error occurred while determining the primary artist: {e}")
        print("Using 'Unknown_Artist' as a fallback.")
    
    if primary_artist_name == 'Unknown_Artist':
         print("\nWarning: Could not definitively determine a primary artist name. Files will be saved under 'Unknown_Artist'.\n")

    print(f"Using primary artist: {primary_artist_name}")

    artist_folder_name = create_safe_filename(primary_artist_name)
    artist_folder_path = os.path.join(os.getcwd(), artist_folder_name)
    os.makedirs(artist_folder_path, exist_ok=True)
    print(f"Output directory: {artist_folder_path}")


    if cover_download:
        print("\n--- Checking for artist-level images from provided URLs ---")
        for i, page_url in enumerate(args.urls):
            print(f"  -> Checking page {i+1}/{len(args.urls)}: {page_url}")
            try:
                response = bandcamp_parser._session_get(page_url, headers=bandcamp_parser.headers)
                soup = bs4.BeautifulSoup(response.text, "lxml")
                download_artist_images(page_url, soup, artist_folder_path, bandcamp_parser, i + 1)
            except Exception as e:
                print(f"    -> Could not process artist images for {page_url}. Error: {e}")

    all_releases_data = []
    downloaded_covers = set()
    removed_log_entries = []
    urls_to_remove = set()
    cover_folder = ""
    if cover_download:
        folder_name_base = create_safe_filename(f"{primary_artist_name} - Album Covers")
        cover_folder = os.path.join(artist_folder_path, folder_name_base)
        os.makedirs(cover_folder, exist_ok=True)

    for i, album_url in enumerate(unique_album_urls):
        print(f"\n--- Processing release {i+1}/{len(unique_album_urls)}: {album_url} ---")
        
        album_data = bandcamp_parser.parse(album_url, fetch_track_art=fetch_track_art)
        
        if album_data:
            if args.save_list:
                is_preorder = album_data.get("is_preorder") is True
                has_empty_trackinfo = isinstance(album_data.get("trackinfo"), list) and not album_data.get("trackinfo")
                reason_for_removal = None

                if is_preorder:
                    reason_for_removal = "Item is a pre-order."
                elif has_empty_trackinfo:
                    reason_for_removal = "Empty trackinfo, assuming album has no streamable tracks."

                if reason_for_removal:
                    print(f"  -> Item will be excluded from URL list. Reason: {reason_for_removal}")
                    urls_to_remove.add(album_url)
                    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    log_entry = (
                        f"[{timestamp}] URL: {album_url}\n"
                        f"        Reason: {reason_for_removal}"
                    )
                    removed_log_entries.append(log_entry)

            all_releases_data.append(album_data)
            
            if cover_download:
                print(f"  -> Checking for album/track covers...")
                process_album_covers(album_data, cover_folder, bandcamp_parser, fetch_track_art, downloaded_covers, hash_covers)

    if args.save_list:
        final_dump_urls = [url for url in unique_album_urls if url not in urls_to_remove]
        list_filename = os.path.join(artist_folder_path, "bandcamp-dump.lst")
        save_url_list(final_dump_urls, list_filename)

        if removed_log_entries:
            removed_filename = os.path.join(artist_folder_path, "removed.txt")
            save_removed_log(removed_log_entries, removed_filename)

    if all_releases_data:
        final_json_data = {primary_artist_name: all_releases_data}
        json_filename_base = f"{create_safe_filename(primary_artist_name)}.json"
        json_filename = os.path.join(artist_folder_path, json_filename_base)
        save_data_to_json(final_json_data, json_filename)
    else:
        print("Finished processing, but no data was successfully extracted.")