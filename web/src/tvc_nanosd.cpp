// TVC-NanoSD IO card, see tvc_nanosd.hpp.
//
// The Nano firmware (TVC_NanoCartSD.ino, (c) 2021 dikdom, BSD-3-Clause, see
// LICENSE-TVC-NanoSD.txt) reads the TVC's bytes into an input queue in an
// interrupt and runs the commands in its main loop, blocking while it waits
// for their parameters; its answers go to an output queue. A register
// between the Nano and the bus holds one byte: the TVC reads it, and the
// Nano's interrupt then puts the next one in (the status if its bit 7 is
// set, else the next byte of the output queue). So an IN gives the byte
// prepared at the previous IN; the card ROM drops the first answer.
// Here the main loop runs as soon as a command has all its bytes.
//
// SPDX-License-Identifier: GPL-2.0-or-later

#include "tvc_nanosd.hpp"
#include "card/card_shim.h"
#include <cstring>
#include <cstdio>
#include <cctype>
#include <deque>
#include <algorithm>

extern "C" {
  extern uint8_t *card_sd_image;
  extern uint32_t card_sd_sectors;
  extern uint32_t card_sd_writes;
}
extern const uint8_t tvc_nanosd_rom_data[8192];

namespace TVCNanoSD {

  // commands and answers of the Nano firmware
  enum {
    C_OPEN = 0, C_CLOSE, C_CHDIR, C_LIST, C_ACK_LIST, C_GETDATA, C_FINFO,
    C_GETCDIR, C_BANKTO0, C_BANKTO1, C_CREATE, C_PUTDATA, C_CLOSEWRITE,
    C_GETPARAMETER, C_SETPARAMETER, C_MKDIR, C_RMDIR, C_DELETE,
    C_CDPINCHANGE_DETECTED, C_NONE = 255
  };
  enum {
    S_OK = 0, S_OPEN_OK, S_DATA_NOT_READY_YET = 0x80, S_WAITING_FOR_INPUT,
    S_FILE_NOT_FOUND, S_END_OF_FILE, S_END_OF_LIST, S_FILE_NOT_OPEN,
    S_CARD_NOT_READY, S_READ_OUT_OF_SYNC, S_BUFFER_OVERRUN, S_BUFFER_UNDERRUN,
    S_CLOSE_OK, S_CLOSE_FAILED, S_CHDIR_OK, S_CHDIR_FAILED, S_BANK_SELECT_DONE,
    S_CREATE_OK, S_CREATE_FAILED, S_DATA_RECEIVED, S_DATA_FAILED_TO_RECEIVE,
    S_MKDIR_OK, S_MKDIR_FAILED, S_RMDIR_OK, S_RMDIR_FAILED, S_DELETE_OK,
    S_DELETE_FAILED, S_INVALID_PARAMETER_ID, S_PARAMETER_SET, S_STATUS_NO_SD = 0xFF
  };
  const size_t kQueueSize = 64 + 16;            // INPUT/OUTPUTDATABUFFER_SIZE
  const int kGetDataSize = 64;
  const char kNanoId[] = "NanoSD Arduino fw v0.32";

  // the Nano's state
  static std::deque<uint8_t> inQ, outQ;
  static uint8_t  latch = S_CARD_NOT_READY;     // the register the TVC reads
  static uint8_t  status = S_CARD_NOT_READY;
  static int      cmd = C_NONE;                 // command waiting for its bytes
  static bool     sdInitialized = false;
  static std::string currentDir = "/";
  static uint32_t dirNext = 0;                  // currentDirFile.openNextFile() position
  static FIL      openFile;
  static bool     openFileValid = false;        // the File object is open
  static bool     fileIsOpen = false;
  static int32_t  fileCounter = 0;              // remainingBytes / bytesWritten
  static uint8_t  savingFileType = 0;
  static uint8_t  params[2] = { 1, 0 };         // EEPROM: menu on, no sorting
  // LIST: the entries of the directory, the next one to send
  static std::vector<std::vector<uint8_t> > listEntries;
  static size_t   listPos = 0;
  static bool     listing = false;

  // the SD card
  static std::vector<uint8_t> sdSectors;
  static FATFS    sdFatFs;

  // --- the SD card as the Nano's SD library sees it ------------------------

  // "2:" + the path, without a trailing '/' (except the root)
  static std::string fsPath(const std::string &p)
  {
    std::string s = p.empty() || p[0] != '/' ? "/" + p : p;
    while (s.size() > 1 && s[s.size() - 1] == '/')
      s.erase(s.size() - 1);
    return "2:" + s;
  }

  static bool exists(const std::string &p)
  {
    std::string f = fsPath(p);
    if (f == "2:/")
      return true;
    FILINFO fi;
    return f_stat(f.c_str(), &fi) == FR_OK;
  }

  static bool isDir(const std::string &p, FILINFO *info = 0)
  {
    std::string f = fsPath(p);
    if (f == "2:/")
      return true;
    FILINFO fi;
    if (f_stat(f.c_str(), &fi) != FR_OK)
      return false;
    if (info)
      *info = fi;
    return (fi.fattrib & AM_DIR) != 0;
  }

  // the 8.3 name, upper case (the SD library knows no long names)
  static std::string shortName(const FILINFO &fi)
  {
    std::string n = fi.altname[0] ? fi.altname : fi.fname;
    for (size_t i = 0; i < n.size(); i++)
      n[i] = char(std::toupper((unsigned char) n[i]));
    return n;
  }

  static bool endsWithCas(const std::string &s)
  {
    return s.size() >= 4 && s.compare(s.size() - 4, 4, ".CAS") == 0;
  }

  // a valid 8.3 name (the SD library cannot create others)
  static bool valid83(const std::string &n)
  {
    size_t dot = n.find('.');
    std::string base = n.substr(0, dot);
    std::string ext = dot == std::string::npos ? "" : n.substr(dot + 1);
    if (base.empty() || base.size() > 8 || ext.size() > 3 || ext.find('.') != std::string::npos)
      return false;
    for (size_t i = 0; i < n.size(); i++) {
      unsigned char c = (unsigned char) n[i];
      if (c == '.')
        continue;
      if (c <= 0x20 || std::strchr("\"*+,/:;<=>?[\\]|", c))
        return false;
    }
    return true;
  }

  static std::string lastComponent(const std::string &p)
  {
    std::string s = p;
    while (s.size() > 1 && s[s.size() - 1] == '/')
      s.erase(s.size() - 1);
    size_t k = s.rfind('/');
    return k == std::string::npos ? s : s.substr(k + 1);
  }

  // the entries of a directory in its order (files and subdirectories; the
  // SD library skips "." "..", and the volume label, FatFS too)
  static std::vector<FILINFO> readDir(const std::string &p)
  {
    std::vector<FILINFO> v;
    DIR dir;
    if (f_opendir(&dir, fsPath(p).c_str()) != FR_OK)
      return v;
    FILINFO fi;
    while (f_readdir(&dir, &fi) == FR_OK && fi.fname[0]) {
      v.push_back(fi);
    }
    f_closedir(&dir);
    return v;
  }

  static void closeOpenFile()
  {
    if (openFileValid)
      f_close(&openFile);
    openFileValid = false;
  }

  // name (padded to 12 with spaces), type, size (a .CAS file without its
  // 128 byte header), as fillFileInfoBuffer()
  static void fileInfo(const FILINFO &fi, uint8_t *data)
  {
    std::string name = shortName(fi);
    for (int i = 0; i < 12; i++)
      data[i] = uint8_t(i < int(name.size()) ? name[i] : ' ');
    bool dir = (fi.fattrib & AM_DIR) != 0;
    data[12] = dir ? 0 : 1;
    uint32_t size = dir ? 0 : uint32_t(fi.fsize);
    if (!dir && endsWithCas(name))
      size -= 128;
    for (int i = 0; i < 4; i++)
      data[13 + i] = uint8_t(size >> (i * 8));
  }

  // --- the main loop -----------------------------------------------------

  static void pushBlock(const uint8_t *p, size_t n)
  {
    for (size_t i = 0; i < n; i++)
      if (outQ.size() < kQueueSize)
        outQ.push_back(p[i]);
  }

  static void push(uint8_t b) { pushBlock(&b, 1); }

  // the bytes up to (and without) a 0, if it has arrived
  static bool takeString(std::string &s)
  {
    std::deque<uint8_t>::iterator z = std::find(inQ.begin(), inQ.end(), uint8_t(0));
    if (z == inQ.end())
      return false;
    s.assign(inQ.begin(), z);
    inQ.erase(inQ.begin(), z + 1);
    return true;
  }

  static uint8_t pop()
  {
    uint8_t b = inQ.front();
    inQ.pop_front();
    return b;
  }

  // getFilePath(): absolute, ending with '/', "../" resolved
  static std::string filePath(std::string name)
  {
    if (name.compare(0, 2, "./") == 0)
      name = name.substr(2);
    if (name.empty() || name[0] != '/')
      name = currentDir + name;
    if (name[name.size() - 1] != '/')
      name += "/";
    std::vector<std::string> parts;
    size_t start = 0, pos;
    while (start < name.size() && (pos = name.find('/', start)) != std::string::npos) {
      std::string p = name.substr(start, pos + 1 - start);
      if (p != "../") {
        if (parts.size() < 16)              // MAX_PATHSTACK_SIZE
          parts.push_back(p);
      } else if (!parts.empty()) {
        parts.pop_back();
      }
      start = pos + 1;
    }
    std::string r;
    for (size_t i = 0; i < parts.size(); i++)
      r += parts[i];
    return r;
  }

  static void handleOpen(std::string fileName)
  {
    status = S_DATA_NOT_READY_YET;
    FILINFO fi;
    bool found = false;
    std::string path;
    if (fileName.empty()) {
      // the first / next .CAS file of the current directory
      std::vector<FILINFO> v = readDir(currentDir);
      while (dirNext < v.size()) {
        const FILINFO &e = v[dirNext++];
        if (e.fattrib & AM_DIR)
          continue;
        if (endsWithCas(shortName(e))) {
          path = currentDir + shortName(e);
          found = true;
          break;
        }
      }
    } else {
      if (fileName[0] != '/')
        fileName = currentDir + fileName;
      for (size_t i = 0; i < fileName.size(); i++)
        fileName[i] = char(std::toupper((unsigned char) fileName[i]));
      if (!exists(fileName) && !endsWithCas(fileName))
        fileName += ".CAS";
      path = fileName;
      found = exists(path);
    }
    if (found && !isDir(path, &fi) && path != "/") {
      closeOpenFile();
      if (f_open(&openFile, fsPath(path).c_str(), FA_READ) == FR_OK)
        openFileValid = true;
    } else {
      found = false;
    }
    if (found && openFileValid) {
      std::string name = shortName(fi);
      uint8_t fileType = 0;
      UINT n = 0;
      f_read(&openFile, &fileType, 1, &n);
      bool casFile = endsWithCas(name) && (n == 1) && (fileType == 0x01 || fileType == 0x11);
      name = name.size() >= 4 ? name.substr(0, name.size() - 4) : std::string();
      push(uint8_t(name.size()));
      pushBlock((const uint8_t *) name.data(), name.size());
      fileCounter = int32_t(f_size(&openFile));
      if (casFile) {
        fileCounter -= 0x80;
        f_lseek(&openFile, 0x80);
      } else {
        f_lseek(&openFile, 0);
      }
      for (int i = 0; i < 4; i++)
        push(uint8_t(uint32_t(fileCounter) >> (i * 8)));
      status = S_OPEN_OK;
      fileIsOpen = true;
    } else {
      status = S_FILE_NOT_FOUND;
      fileIsOpen = false;
    }
  }

  static void handleClose()
  {
    if (fileIsOpen) {
      closeOpenFile();
      fileIsOpen = false;
    }
    fileCounter = 0;
    outQ.clear();
    status = S_CLOSE_OK;
  }

  static void handleGetData()
  {
    uint8_t buf[kGetDataSize + 1];
    int toRead = int(std::min<int32_t>(fileCounter, kGetDataSize));
    UINT len = 0;
    if (toRead > 0 && openFileValid)
      f_read(&openFile, &buf[1], UINT(toRead), &len);
    if (len > 0) {
      buf[0] = uint8_t(len);
      pushBlock(buf, len + 1);
      fileCounter -= int32_t(len);
      status = S_OK;
    } else {
      status = S_END_OF_FILE;
    }
  }

  static void listStart()
  {
    listEntries.clear();
    std::vector<FILINFO> v = readDir(currentDir);
    for (size_t i = 0; i < v.size(); i++) {
      std::vector<uint8_t> e(18);
      e[0] = S_OK;
      fileInfo(v[i], &e[1]);
      listEntries.push_back(e);
    }
    listPos = 0;
    listing = true;
  }

  // sends the next entry, or ends the list; true: waits for its ACK_LIST
  static bool listNext()
  {
    if (listPos < listEntries.size()) {
      pushBlock(&listEntries[listPos][0], 18);
      listPos++;
      status = S_OK;
      return true;
    }
    status = S_END_OF_LIST;
    listing = false;
    return false;
  }

  static void handleChDir(const std::string &name)
  {
    std::string p = filePath(name);
    if (isDir(p)) {
      currentDir = p;
      dirNext = 0;                          // a new currentDirFile
      status = S_CHDIR_OK;
    } else {
      status = S_CHDIR_FAILED;
    }
  }

  static void handleFileInfo(std::string name)
  {
    if (name.empty() || name[0] != '/')
      name = currentDir + name;
    status = S_DATA_NOT_READY_YET;
    FILINFO fi;
    std::string f = fsPath(name);
    if (f != "2:/" && f_stat(f.c_str(), &fi) == FR_OK) {
      uint8_t buf[18];
      buf[0] = S_OK;
      fileInfo(fi, &buf[1]);
      pushBlock(buf, 17);                   // the firmware sends 17 of the 18
      status = S_OK;
    } else {
      status = S_FILE_NOT_FOUND;
    }
  }

  static void handleGetCDir()
  {
    size_t len = std::min<size_t>(std::min<size_t>(currentDir.size(), 127), kQueueSize - 1);
    push(uint8_t(len));
    pushBlock((const uint8_t *) currentDir.data(), len);
    status = S_OK;
  }

  static void handleCreate(std::string fileName, uint8_t type)
  {
    if (fileName.empty())
      fileName = "NONAME.CAS";
    savingFileType = type;
    if (fileName.rfind('.') == std::string::npos)
      fileName += ".CAS";
    else if (fileName.rfind(".CAS") != fileName.size() - 4 || fileName.size() < 4)
      savingFileType = 0x00;
    if (fileName[0] != '/')
      fileName = currentDir + fileName;
    // the SD library makes upper case 8.3 names
    for (size_t i = 0; i < fileName.size(); i++)
      fileName[i] = char(std::toupper((unsigned char) fileName[i]));
    closeOpenFile();
    // FILE_WRITE: create, or append to an existing file
    bool ok = valid83(lastComponent(fileName)) && !isDir(fileName)
              && f_open(&openFile, fsPath(fileName).c_str(),
                        FA_READ | FA_WRITE | FA_OPEN_APPEND) == FR_OK;
    openFileValid = ok;
    if (ok) {
      if (savingFileType == 0x01 || savingFileType == 0x11) {
        uint8_t hdr[128] = { 0 };
        hdr[0] = savingFileType;
        UINT n;
        f_write(&openFile, hdr, 128, &n);
      }
      fileCounter = 0;
      status = S_CREATE_OK;
    } else {
      status = S_CREATE_FAILED;
    }
  }

  static void handlePutData(const std::vector<uint8_t> &data)
  {
    bool ok = openFileValid;
    if (ok && !data.empty()) {
      UINT n = 0;
      ok = f_write(&openFile, &data[0], UINT(data.size()), &n) == FR_OK && n == data.size();
    }
    fileCounter += int32_t(data.size());
    status = ok ? S_DATA_RECEIVED : S_DATA_FAILED_TO_RECEIVE;
  }

  static void handleCloseForWrite()
  {
    if (openFileValid) {
      if (savingFileType == 0x01 || savingFileType == 0x11) {
        int lastBlock = fileCounter % 128;
        int missing = 128 - lastBlock;
        if (savingFileType == 0x01 && missing != 128) {
          uint8_t zero[128] = { 0 };
          UINT n;
          f_write(&openFile, zero, UINT(missing), &n);
        }
        f_sync(&openFile);
      }
      closeOpenFile();
      status = S_CLOSE_OK;
    } else {
      status = S_CLOSE_FAILED;
    }
  }

  static void handleGetParameter(uint8_t idx)
  {
    uint8_t ret = S_OK;
    switch (idx) {
    case 0:                                 // PARAM_MENU_STATUS
    case 1:                                 // PARAM_DEFAULT_SORT
      push(1);
      push(params[idx]);
      break;
    case 2:                                 // PARAM_SD_STATE
      push(1);
      push(sdInitialized ? 1 : 0);
      break;
    case 3:                                 // PARAM_NANO_VERSION
      push(3);
      pushBlock((const uint8_t *) kNanoId, std::strlen(kNanoId));
      push(0);
      break;
    default:
      ret = S_INVALID_PARAMETER_ID;
      break;
    }
    status = ret;
  }

  // the card detect switch changed
  static void handleCardChange()
  {
    if (!card_sd_image) {
      status = S_CARD_NOT_READY;
      sdInitialized = false;
      closeOpenFile();
      fileIsOpen = false;
    } else if (!sdInitialized) {
      if (!isDir(currentDir))
        currentDir = "/";
      dirNext = 0;
      sdInitialized = true;
      status = S_DATA_NOT_READY_YET;
    }
  }

  static bool mkdirs(const std::string &p)
  {
    // SD.mkdir(): every directory of the path
    std::string f = fsPath(p);
    for (size_t i = 3; i <= f.size(); i++) {
      if (i == f.size() || f[i] == '/') {
        std::string d = f.substr(0, i);
        FILINFO fi;
        if (d.size() > 3 && f_stat(d.c_str(), &fi) != FR_OK) {
          if (!valid83(lastComponent(d)) || f_mkdir(d.c_str()) != FR_OK)
            return false;
        }
      }
    }
    return true;
  }

  // runs the command 'cmd' if all its bytes have arrived; false: waits
  static bool step()
  {
    std::string s;
    switch (cmd) {
    case C_OPEN:
      status = S_WAITING_FOR_INPUT;
      if (fileIsOpen)
        closeOpenFile();
      if (!takeString(s))
        return false;
      handleOpen(s);
      return true;
    case C_CLOSE:
      handleClose();
      return true;
    case C_GETDATA:
      handleGetData();
      return true;
    case C_LIST:
      if (!listing) {
        listStart();
        if (!listNext())
          return true;
      }
      // waiting for ACK_LIST
      if (inQ.empty())
        return false;
      if (pop() != C_ACK_LIST) {
        outQ.clear();
        listing = false;
        status = S_END_OF_LIST;             // READ_OUT_OF_SYNC, then END_OF_LIST
        return true;
      }
      status = S_DATA_NOT_READY_YET;
      if (listNext())
        return false;
      return true;
    case C_CHDIR:
      status = S_WAITING_FOR_INPUT;
      if (!takeString(s))
        return false;
      status = S_DATA_NOT_READY_YET;
      handleChDir(s);
      return true;
    case C_FINFO:
      status = S_WAITING_FOR_INPUT;
      if (!takeString(s))
        return false;
      handleFileInfo(s);
      return true;
    case C_GETCDIR:
      handleGetCDir();
      return true;
    case C_BANKTO0:
    case C_BANKTO1:
      status = S_BANK_SELECT_DONE;
      return true;
    case C_CREATE: {
      if (inQ.empty())
        return false;
      size_t len = inQ[0], take = std::min<size_t>(len, 63);
      if (inQ.size() < 1 + take + 1)
        return false;
      pop();
      for (size_t i = 0; i < take; i++)
        s += char(pop());
      uint8_t type = pop();
      handleCreate(s, type);
      return true;
    }
    case C_PUTDATA: {
      if (inQ.empty() || inQ.size() < 1 + size_t(inQ[0]))
        return false;
      std::vector<uint8_t> d(pop());
      for (size_t i = 0; i < d.size(); i++)
        d[i] = pop();
      handlePutData(d);
      return true;
    }
    case C_CLOSEWRITE:
      handleCloseForWrite();
      return true;
    case C_GETPARAMETER:
      if (inQ.empty())
        return false;
      handleGetParameter(pop());
      return true;
    case C_SETPARAMETER: {
      if (inQ.empty())
        return false;
      uint8_t idx = inQ[0];
      if (idx <= 1) {
        if (inQ.size() < 2)
          return false;
        pop();
        params[idx] = pop();
        status = S_PARAMETER_SET;
      } else {
        pop();
        status = S_INVALID_PARAMETER_ID;
      }
      return true;
    }
    case C_MKDIR:
    case C_RMDIR:
    case C_DELETE: {
      if (!takeString(s))
        return false;
      status = S_DATA_NOT_READY_YET;
      std::string p = filePath(s);
      for (size_t i = 0; i < p.size(); i++)        // 8.3 names: upper case
        p[i] = char(std::toupper((unsigned char) p[i]));
      bool ok;
      if (cmd == C_MKDIR) {
        ok = !exists(p) && mkdirs(p);
        status = ok ? S_MKDIR_OK : S_MKDIR_FAILED;
      } else if (cmd == C_RMDIR) {
        ok = exists(p) && isDir(p) && fsPath(p) != "2:/"
             && f_unlink(fsPath(p).c_str()) == FR_OK;    // only an empty one
        status = ok ? S_RMDIR_OK : S_RMDIR_FAILED;
      } else {
        // SD.remove(): a file (the path ends with '/' here, as on the Nano)
        ok = exists(p) && !isDir(p) && f_unlink(fsPath(p).c_str()) == FR_OK;
        status = ok ? S_DELETE_OK : S_DELETE_FAILED;
      }
      return true;
    }
    case C_CDPINCHANGE_DETECTED:
      handleCardChange();
      return true;
    default:
      return true;                          // unknown: the status stays
    }
  }

  static void process()
  {
    for (int guard = 0; guard < 1000; guard++) {
      if (cmd == C_NONE) {
        if (inQ.empty())
          return;
        cmd = pop();
        status = S_DATA_NOT_READY_YET;
        if (!sdInitialized && cmd != C_GETPARAMETER && cmd != C_CDPINCHANGE_DETECTED) {
          if (cmd == 254) {
            push(75);
            status = S_OK;
          } else {
            status = S_STATUS_NO_SD;
            inQ.clear();
          }
          cmd = C_NONE;
          continue;
        }
      }
      if (!step())
        return;
      cmd = C_NONE;
    }
  }

  // --- the TVC's side -----------------------------------------------------

  uint8_t romRead(uint16_t addr)
  {
    return tvc_nanosd_rom_data[addr & 0x1FFF];
  }

  uint8_t ioPeek()
  {
    return latch;
  }

  uint8_t ioRead()
  {
    uint8_t v = latch;
    // the Nano's INT0 handler: the next byte into the register
    if (status & 0x80) {
      latch = status;
    } else if (!outQ.empty()) {
      latch = outQ.front();
      outQ.pop_front();
    } else {
      latch = S_BUFFER_UNDERRUN;
    }
    return v;
  }

  void ioWrite(uint8_t value)
  {
    if (inQ.size() < kQueueSize)
      inQ.push_back(value);
    else
      status = S_BUFFER_OVERRUN;
    process();
  }

  void powerOn()
  {
    inQ.clear();
    outQ.clear();
    cmd = C_NONE;
    listing = false;
    closeOpenFile();
    fileIsOpen = false;
    fileCounter = 0;
    currentDir = "/";
    dirNext = 0;
    sdInitialized = (card_sd_image != 0);
    status = sdInitialized ? S_DATA_NOT_READY_YET : S_CARD_NOT_READY;
    latch = status;                         // initTVC_IN_register()
  }

  uint8_t getParam(int n)
  {
    return params[n & 1];
  }

  void setParam(int n, uint8_t value)
  {
    params[n & 1] = value;
  }

  // --- the SD card --------------------------------------------------------

  static void cardChanged()
  {
    // the card detect interrupt pushes CDPINCHANGE_DETECTED
    if (inQ.size() < kQueueSize)
      inQ.push_back(C_CDPINCHANGE_DETECTED);
    process();
  }

  bool sdInsert(uint32_t sizeMB)
  {
    if (card_sd_image)
      sdRemove();
    if (sizeMB < 1 || sizeMB > 2048)
      return false;
    sdSectors.assign(size_t(sizeMB) << 20, 0);
    card_sd_image = &sdSectors[0];
    card_sd_sectors = uint32_t(sdSectors.size() / 512);
    static uint8_t work[4096];
    MKFS_PARM opt = { FM_FAT | FM_FAT32 | FM_SFD, 0, 0, 0, 0 };
    if (f_mkfs("2:", &opt, work, sizeof(work)) != FR_OK
        || f_mount(&sdFatFs, "2:", 1) != FR_OK) {
      sdRemove();
      return false;
    }
    cardChanged();
    return true;
  }

  void sdRemove()
  {
    closeOpenFile();
    if (card_sd_image)
      f_mount(0, "2:", 0);
    card_sd_image = 0;
    card_sd_sectors = 0;
    sdSectors.clear();
    cardChanged();
  }

  bool sdPresent() { return card_sd_image != 0; }

  uint32_t sdWrites() { return card_sd_writes; }

  static std::string pagePath(const char *path)
  {
    std::string p = path ? path : "";
    while (!p.empty() && p[0] == '/')
      p.erase(0, 1);
    return "2:/" + p;
  }

  bool sdMkdirs(const char *path)
  {
    if (!card_sd_image)
      return false;
    std::string p = pagePath(path);
    for (size_t i = 3; i <= p.size(); i++) {
      if (i == p.size() || p[i] == '/') {
        std::string d = p.substr(0, i);
        if (d.size() > 3) {
          FRESULT r = f_mkdir(d.c_str());
          if (r != FR_OK && r != FR_EXIST)
            return false;
        }
      }
    }
    return true;
  }

  bool sdPutFile(const char *name, const uint8_t *data, size_t size)
  {
    if (!card_sd_image)
      return false;
    std::string path = pagePath(name);
    size_t slash = path.rfind('/');
    if (slash > 3 && !sdMkdirs(path.substr(3, slash - 3).c_str()))
      return false;
    FIL f;
    if (f_open(&f, path.c_str(), FA_WRITE | FA_CREATE_ALWAYS) != FR_OK)
      return false;
    UINT n = 0;
    bool ok = (f_write(&f, data, UINT(size), &n) == FR_OK && n == size);
    ok = (f_close(&f) == FR_OK) && ok;
    return ok;
  }

  // [{"n":name,"s":size,"d":0/1,"a":8.3 name},...]
  std::string sdList(const char *path)
  {
    std::string out = "[";
    DIR dir;
    if (!card_sd_image || f_opendir(&dir, pagePath(path).c_str()) != FR_OK)
      return "null";
    FILINFO fi;
    bool first = true;
    while (f_readdir(&dir, &fi) == FR_OK && fi.fname[0]) {
      std::string n;
      for (const char *c = fi.fname; *c; c++) {
        unsigned char ch = (unsigned char) *c;
        if (ch == '"' || ch == '\\') { n += '\\'; n += char(ch); }
        else if (ch < 0x20 || ch >= 0x80) { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", ch); n += b; }
        else n += char(ch);
      }
      char rest[96];
      std::snprintf(rest, sizeof rest, "\",\"s\":%lu,\"d\":%d,\"a\":\"%s\"}",
                    (unsigned long) fi.fsize, (fi.fattrib & AM_DIR) ? 1 : 0, shortName(fi).c_str());
      out += (first ? "{\"n\":\"" : ",{\"n\":\"") + n + rest;
      first = false;
    }
    f_closedir(&dir);
    return out + "]";
  }

  bool sdGetFile(const char *path, std::vector<uint8_t> &data)
  {
    FIL f;
    if (!card_sd_image || f_open(&f, pagePath(path).c_str(), FA_READ) != FR_OK)
      return false;
    data.resize(size_t(f_size(&f)));
    UINT n = 0;
    bool ok = data.empty() || (f_read(&f, &data[0], UINT(data.size()), &n) == FR_OK && n == data.size());
    f_close(&f);
    return ok;
  }

  static bool deleteTree(const std::string &p)
  {
    FILINFO fi;
    if (f_stat(p.c_str(), &fi) != FR_OK)
      return false;
    if (fi.fattrib & AM_DIR) {
      std::vector<std::string> names;
      DIR dir;
      if (f_opendir(&dir, p.c_str()) == FR_OK) {
        while (f_readdir(&dir, &fi) == FR_OK && fi.fname[0])
          names.push_back(fi.fname);
        f_closedir(&dir);
      }
      for (size_t i = 0; i < names.size(); i++)
        if (!deleteTree(p + "/" + names[i]))
          return false;
    }
    return f_unlink(p.c_str()) == FR_OK;
  }

  bool sdDelete(const char *path)
  {
    if (!card_sd_image)
      return false;
    std::string p = pagePath(path);
    if (p.size() <= 3)
      return false;
    closeOpenFile();
    return deleteTree(p);
  }

  bool sdSpace(uint32_t &totalKB, uint32_t &freeKB)
  {
    DWORD nclst = 0;
    FATFS *fs = 0;
    if (!card_sd_image || f_getfree("2:", &nclst, &fs) != FR_OK)
      return false;
    totalKB = uint32_t((uint64_t(fs->n_fatent - 2) * fs->csize * 512) >> 10);
    freeKB = uint32_t((uint64_t(nclst) * fs->csize * 512) >> 10);
    return true;
  }

  bool setCurrentDir(const char *path)
  {
    std::string p = "/";
    if (path && *path) {
      p += path;
      if (p[p.size() - 1] != '/')
        p += "/";
    }
    // the Nano works with upper case 8.3 paths
    for (size_t i = 0; i < p.size(); i++)
      p[i] = char(std::toupper((unsigned char) p[i]));
    if (!isDir(p))
      return false;
    currentDir = p;
    dirNext = 0;
    return true;
  }

}
