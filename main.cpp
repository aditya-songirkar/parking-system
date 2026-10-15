#include <iostream>
#include <string>
#include <vector>
#include <ctime>
#include <fstream>
#include <iomanip>
#include <cmath>
#include <sstream>
#include <stdexcept>

using namespace std;
const int TOTAL_SLOTS = 10;
const double NORMAL_RATE = 40.0;
const double RESERVED_RATE = 100.0;

// Abstract Base class Vehicle (Polymorphism)
class Vehicle {
public:
    string plate;
    string owner;
    string type;
    bool reserved;
    time_t entryTime;

    Vehicle() : plate(""), owner(""), type(""), reserved(false), entryTime(0) {}
    Vehicle(string p, string o, string t, bool r, time_t e) 
        : plate(p), owner(o), type(t), reserved(r), entryTime(e) {}
        
    virtual ~Vehicle() = default;
    virtual double calculateFee(int hours) const = 0;
};

// Derived class for Normal Vehicles (Inheritance)
class NormalVehicle : public Vehicle {
public:
    NormalVehicle() : Vehicle() {}
    NormalVehicle(string p, string o, string t, time_t e) 
        : Vehicle(p, o, t, false, e) {}
        
    double calculateFee(int hours) const override {
        return hours * NORMAL_RATE;
    }
};

// Derived class for Reserved Vehicles (Inheritance)
class ReservedVehicle : public Vehicle {
public:
    ReservedVehicle() : Vehicle() {}
    ReservedVehicle(string p, string o, string t, time_t e) 
        : Vehicle(p, o, t, true, e) {}
        
    double calculateFee(int hours) const override {
        return hours * RESERVED_RATE;
    }
};

// Custom Exception Handling
class ParkingException : public exception {
private:
    string msg;
public:
    ParkingException(const string& message) : msg(message) {}
    const char* what() const noexcept override {
        return msg.c_str();
    }
};

// History record structure
struct HistoryLog {
    string plate;
    string owner;
    string type;
    string dateStr;
    string entryTimeStr;
    string exitTimeStr;
    int durationHours;
    double fee;
    bool reserved;
};

// Feedback structure
struct FeedbackLog {
    int rating;
    string message;
    string timestamp;
};

// Core Management System
class ParkingLot {
private:
    Vehicle* slots[TOTAL_SLOTS];
    vector<HistoryLog> history;
    vector<FeedbackLog> feedbackList;
    double totalRevenueNormal;
    double totalRevenueReserved;

    // Helper utilities for date/time
    string timeToString(time_t t) {
        char buffer[30];
        struct tm* tm_info = localtime(&t);
        strftime(buffer, 30, "%Y-%m-%d %H:%M:%S", tm_info);
        return string(buffer);
    }
    
    string dateToString(time_t t) {
        char buffer[30];
        struct tm* tm_info = localtime(&t);
        strftime(buffer, 30, "%Y-%m-%d", tm_info);
        return string(buffer);
    }

    string escapeJSON(const string& s) {
        string out = "";
        for(char c : s) {
            if(c == '"') out += "\\\"";
            else if(c == '\\') out += "\\\\";
            else out += c;
        }
        return out;
    }

public:
    ParkingLot() {
        for (int i = 0; i < TOTAL_SLOTS; i++) {
            slots[i] = nullptr;
        }
        totalRevenueNormal = 0;
        totalRevenueReserved = 0;
        loadState();
    }

    ~ParkingLot() {
        saveState();
        for (int i = 0; i < TOTAL_SLOTS; i++) {
            if (slots[i] != nullptr) {
                delete slots[i];
            }
        }
    }

    // JSON Interface for Backend Node Integration
    string getStatusJSON() {
        stringstream ss;
        ss << "{";
        ss << "\"slots\": [";
        for (int i = 0; i < TOTAL_SLOTS; i++) {
            if (slots[i]) {
                ss << "{";
                ss << "\"plate\": \"" << escapeJSON(slots[i]->plate) << "\",";
                ss << "\"owner\": \"" << escapeJSON(slots[i]->owner) << "\",";
                ss << "\"type\": \"" << escapeJSON(slots[i]->type) << "\",";
                ss << "\"reserved\": " << (slots[i]->reserved ? "true" : "false") << ",";
                ss << "\"entryTime\": " << ((long long)slots[i]->entryTime * 1000); // Send as ms epoch time
                ss << "}";
            } else {
                ss << "null";
            }
            if (i < TOTAL_SLOTS - 1) ss << ",";
        }
        ss << "],";
        
        ss << "\"history\": [";
        for (size_t i = 0; i < history.size(); i++) {
            const auto& log = history[i];
            ss << "{";
            ss << "\"plate\": \"" << escapeJSON(log.plate) << "\",";
            ss << "\"owner\": \"" << escapeJSON(log.owner) << "\",";
            ss << "\"type\": \"" << escapeJSON(log.type) << "\",";
            ss << "\"entryTime\": \"" << escapeJSON(log.entryTimeStr) << "\",";
            ss << "\"exitTime\": \"" << escapeJSON(log.exitTimeStr) << "\",";
            ss << "\"date\": \"" << escapeJSON(log.dateStr) << "\",";
            ss << "\"durationHours\": " << log.durationHours << ",";
            ss << "\"fee\": " << log.fee << ",";
            ss << "\"reserved\": " << (log.reserved ? "true" : "false");
            ss << "}";
            if (i < history.size() - 1) ss << ",";
        }
        ss << "],";
        
        ss << "\"totalRevenueNormal\": " << totalRevenueNormal << ",";
        ss << "\"totalRevenueReserved\": " << totalRevenueReserved << ",";
        
        ss << "\"feedback\": [";
        for (size_t i = 0; i < feedbackList.size(); i++) {
            ss << "{";
            ss << "\"rating\": " << feedbackList[i].rating << ",";
            ss << "\"message\": \"" << escapeJSON(feedbackList[i].message) << "\",";
            ss << "\"timestamp\": \"" << escapeJSON(feedbackList[i].timestamp) << "\"";
            ss << "}";
            if (i < feedbackList.size() - 1) ss << ",";
        }
        ss << "]";
        ss << "}";
        return ss.str();
    }

    string cliParkVehicle(string plate, string owner, string type, bool reserved) {
        int emptySlot = -1;
        for (int i = 0; i < TOTAL_SLOTS; i++) {
            if (slots[i] == nullptr) {
                emptySlot = i;
                break;
            }
        }

        if (emptySlot == -1) {
            return "{\"success\": false, \"message\": \"Parking Full!\"}";
        }

        for (int i = 0; i < TOTAL_SLOTS; i++) {
            if (slots[i] != nullptr && slots[i]->plate == plate) {
                return "{\"success\": false, \"message\": \"Vehicle with this plate is already parked!\"}";
            }
        }

        time_t entryT = time(0);
        
        try {
            if (reserved) {
                slots[emptySlot] = new ReservedVehicle(plate, owner, type, entryT);
            } else {
                slots[emptySlot] = new NormalVehicle(plate, owner, type, entryT);
            }
        } catch (const bad_alloc& e) {
            return "{\"success\": false, \"message\": \"Memory allocation failed\"}";
        }
        
        saveState();

        return "{\"success\": true, \"slot\": " + to_string(emptySlot + 1) + "}";
    }

    string cliCheckoutVehicle(int slotNum) {
        try {
            if (slotNum < 1 || slotNum > TOTAL_SLOTS) {
                throw ParkingException("Invalid slot selected.");
            }
            if (slots[slotNum - 1] == nullptr) {
                throw ParkingException("Selected slot is empty.");
            }
        } catch (const ParkingException& e) {
            return "{\"success\": false, \"message\": \"" + string(e.what()) + "\"}";
        }

        int index = slotNum - 1;
        Vehicle* v = slots[index];
        time_t exitT = time(0);
        
        double seconds = difftime(exitT, v->entryTime);
        int hours = ceil(seconds / 3600.0);
        if (hours == 0) hours = 1; 
        
        // Polymorphism usage
        double totalFee = v->calculateFee(hours);

        HistoryLog log;
        log.plate = v->plate;
        log.owner = v->owner;
        log.type = v->type;
        log.dateStr = dateToString(exitT);
        log.entryTimeStr = timeToString(v->entryTime);
        log.exitTimeStr = timeToString(exitT);
        log.durationHours = hours;
        log.fee = totalFee;
        log.reserved = v->reserved;

        history.insert(history.begin(), log);

        if (v->reserved) {
            totalRevenueReserved += totalFee;
        } else {
            totalRevenueNormal += totalFee;
        }

        delete slots[index];
        slots[index] = nullptr;
        saveState();

        return "{\"success\": true, \"fee\": " + to_string(totalFee) + ", \"hours\": " + to_string(hours) + "}";
    }

    string cliResetRevenue() {
        totalRevenueNormal = 0;
        totalRevenueReserved = 0;
        saveState();
        return "{\"success\": true}";
    }

    string cliLogin(string username, string password) {
        if (username == "admin" && password == "password123") {
            return "{\"success\": true, \"message\": \"Login successful\", \"role\": \"System Manager\", \"name\": \"Admin User\"}";
        }
        return "{\"success\": false, \"message\": \"Invalid username or password\"}";
    }

    string cliSubmitFeedback(int rating, string message) {
        FeedbackLog f;
        f.rating = rating;
        f.message = message;
        f.timestamp = timeToString(time(0));
        
        feedbackList.insert(feedbackList.begin(), f);
        saveState();
        return "{\"success\": true}";
    }

    // ORIGINAL INTERACTIVE METHODS BELOW

    void parkVehicle() {
        int emptySlot = -1;
        for (int i = 0; i < TOTAL_SLOTS; i++) {
            if (slots[i] == nullptr) {
                emptySlot = i;
                break;
            }
        }

        if (emptySlot == -1) {
            cout << "\n[!] Parking Full! No available slots for now.\n";
            return;
        }

        string plate, owner, type;
        int resInput;
        bool reserved;

        cout << "\n--- Park Vehicle ---\n";
        cout << "Enter Plate Number: ";
        cin >> ws;
        getline(cin, plate);
        
        for(int i = 0; i < TOTAL_SLOTS; i++) {
            if(slots[i] != nullptr && slots[i]->plate == plate) {
                cout << "[!] Vehicle with this plate is already parked!\n";
                return;
            }
        }

        cout << "Enter Owner Name: ";
        getline(cin, owner);
        cout << "Enter Vehicle Type (e.g. SUV, Sedan, Bike): ";
        getline(cin, type);
        cout << "Is it a reserved slot type? (1 for Yes, 0 for No): ";
        cin >> resInput;
        reserved = (resInput == 1);

        time_t entryT = time(0);
        
        try {
            if (reserved) {
                slots[emptySlot] = new ReservedVehicle(plate, owner, type, entryT);
            } else {
                slots[emptySlot] = new NormalVehicle(plate, owner, type, entryT);
            }
        } catch (const bad_alloc& e) {
            cout << "[!] System Error: Memory allocation failed!\n";
            return;
        }
        
        cout << "[+] Vehicle parked successfully at slot number " << (emptySlot + 1) << "!\n";
        saveState();
    }

    void checkoutVehicle() {
        cout << "\n--- Checkout Vehicle ---\n";
        showSlots();

        int slotNum;
        cout << "\nEnter Slot Number to checkout (1-" << TOTAL_SLOTS << ") or 0 to cancel: ";
        cin >> slotNum;

        if (slotNum == 0) return;

        try {
            if (slotNum < 1 || slotNum > TOTAL_SLOTS) {
                throw ParkingException("Invalid slot number selected.");
            }
            if (slots[slotNum - 1] == nullptr) {
                throw ParkingException("Selected slot is currently empty.");
            }
        } catch (const ParkingException& e) {
            cout << "[!] " << e.what() << "\n";
            return;
        }

        int index = slotNum - 1;
        Vehicle* v = slots[index];
        time_t exitT = time(0);
        
        double seconds = difftime(exitT, v->entryTime);
        int hours = ceil(seconds / 3600.0);
        if (hours == 0) hours = 1; 
        
        // Polymorphism usage
        double totalFee = v->calculateFee(hours);

        cout << "\n--- Checkout Details ---\n";
        cout << "Slot Number: " << slotNum << "\n";
        cout << "Plate: " << v->plate << "\n";
        cout << "Owner: " << v->owner << "\n";
        cout << "Type: " << v->type << "\n";
        cout << "Status: " << (v->reserved ? "Reserved" : "Normal") << "\n";
        cout << "Entry Time: " << timeToString(v->entryTime) << "\n";
        cout << "Hours: " << hours << "\n";
        cout << "Amount to Pay: Rs " << totalFee << "\n";
        
        cout << "Confirm Checkout? (y/n): ";
        char confirm;
        cin >> confirm;

        if (confirm == 'y' || confirm == 'Y') {
            HistoryLog log;
            log.plate = v->plate;
            log.owner = v->owner;
            log.type = v->type;
            log.dateStr = dateToString(exitT);
            log.entryTimeStr = timeToString(v->entryTime);
            log.exitTimeStr = timeToString(exitT);
            log.durationHours = hours;
            log.fee = totalFee;
            log.reserved = v->reserved;

            history.insert(history.begin(), log);

            if (v->reserved) {
                totalRevenueReserved += totalFee;
            } else {
                totalRevenueNormal += totalFee;
            }

            delete slots[index];
            slots[index] = nullptr;
            saveState();

            cout << "[+] Checkout successful. Collected Rs " << totalFee << ".\n";
        } else {
            cout << "Checkout cancelled.\n";
        }
    }

    void showDashboard() {
        int occupied = 0;
        int activeToday = 0;
        string todayStr = dateToString(time(0));

        for (int i = 0; i < TOTAL_SLOTS; i++) {
            if (slots[i] != nullptr) {
                occupied++;
                if (dateToString(slots[i]->entryTime) == todayStr) {
                    activeToday++;
                }
            }
        }
        
        int checkedOutToday = 0;
        for (const auto& log : history) {
            if (log.dateStr == todayStr) checkedOutToday++;
        }

        int available = TOTAL_SLOTS - occupied;

        cout << "\n========== DASHBOARD ==========\n";
        cout << "Available Slots: " << available << "\n";
        cout << "Occupied Slots:  " << occupied << "\n";
        cout << "Today's Parkings: " << (activeToday + checkedOutToday) << "\n";
        cout << "===============================\n";
    }

    void showSlots() {
        cout << "\n--- Occupied Slots Detail ---\n";
        bool isEmpty = true;
        for (int i = 0; i < TOTAL_SLOTS; i++) {
            if (slots[i] != nullptr) {
                isEmpty = false;
                Vehicle* v = slots[i];
                cout << "Slot " << (i + 1) << " | Plate: " << v->plate 
                     << " | Owner: " << v->owner 
                     << " | Type: " << v->type
                     << " | " << (v->reserved ? "Reserved" : "Normal")
                     << " | In: " << timeToString(v->entryTime) << "\n";
            }
        }
        if (isEmpty) {
            cout << "No vehicles are currently parked.\n";
        }
    }

    void showRevenue() {
        cout << "\n========== REVENUE ==========\n";
        cout << "Normal (Rs " << NORMAL_RATE << "/hr):   Rs " << totalRevenueNormal << "\n";
        cout << "Reserved (Rs " << RESERVED_RATE << "/hr): Rs " << totalRevenueReserved << "\n";
        cout << "-----------------------------\n";
        cout << "Total Revenue:        Rs " << (totalRevenueNormal + totalRevenueReserved) << "\n";
        cout << "=============================\n";
    }

    void showHistory() {
        cout << "\n--- Vehicle Checkout History ---\n";
        if (history.empty()) {
            cout << "No history available yet.\n";
            return;
        }
        
        for (const auto& log : history) {
            cout << "Date: " << log.dateStr 
                 << " | Plate: " << log.plate
                 << " | Owner: " << log.owner
                 << " | Type: " << log.type
                 << " | Duration: " << log.durationHours << " hr(s)"
                 << " | Fee: Rs " << log.fee << "\n";
        }
    }

    // Basic file I/O for state persistence
    void saveState() {
        ofstream out("parking_data.txt");
        if (!out) return;

        out << totalRevenueNormal << " " << totalRevenueReserved << "\n";
        
        for (int i = 0; i < TOTAL_SLOTS; i++) {
            if (slots[i] != nullptr) {
                out << i << "\n" 
                    << slots[i]->reserved << "\n" 
                    << slots[i]->entryTime << "\n" 
                    << slots[i]->plate << "\n"
                    << slots[i]->owner << "\n"
                    << slots[i]->type << "\n";
            }
        }
        out << "-1\n"; // End marker for active slots

        for (const auto& log : history) {
            out << log.reserved << "\n"
                << log.durationHours << "\n"
                << log.fee << "\n"
                << log.dateStr << "\n"
                << log.entryTimeStr << "\n"
                << log.exitTimeStr << "\n"
                << log.plate << "\n"
                << log.owner << "\n"
                << log.type << "\n";
        }
        out << "-1\n"; // End marker for history

        for (const auto& fb : feedbackList) {
            out << fb.rating << "\n"
                << fb.timestamp << "\n"
                << fb.message << "\n";
        }
        out << "-1\n"; // End marker for feedback
        out.close();
    }

    void loadState() {
        ifstream in("parking_data.txt");
        if (!in) return;

        if (!(in >> totalRevenueNormal >> totalRevenueReserved)) return;

        int slotIdx;
        while (in >> slotIdx && slotIdx != -1) {
            bool rsv;
            time_t etime;
            string p, o, t;
            
            in >> rsv >> etime;
            in >> ws; getline(in, p);
            in >> ws; getline(in, o);
            in >> ws; getline(in, t);
            
            if (rsv) {
                slots[slotIdx] = new ReservedVehicle(p, o, t, etime);
            } else {
                slots[slotIdx] = new NormalVehicle(p, o, t, etime);
            }
        }

        int startFlag;
        while (in >> startFlag && startFlag != -1) {
            HistoryLog log;
            log.reserved = (startFlag == 1);
            in >> log.durationHours >> log.fee;
            
            in >> ws; getline(in, log.dateStr);
            in >> ws; getline(in, log.entryTimeStr);
            in >> ws; getline(in, log.exitTimeStr);
            in >> ws; getline(in, log.plate);
            in >> ws; getline(in, log.owner);
            in >> ws; getline(in, log.type);
            
            history.push_back(log);
        }

        int fbRating;
        while (in >> fbRating && fbRating != -1) {
            FeedbackLog f;
            f.rating = fbRating;
            in >> ws; getline(in, f.timestamp);
            in >> ws; getline(in, f.message);
            feedbackList.push_back(f);
        }
        in.close();
    }
};

int main(int argc, char* argv[]) {
    ParkingLot lot;

    // CLI Mode for Node.js Backend
    if (argc > 1) {
        string cmd = argv[1];
        if (cmd == "status") {
            cout << lot.getStatusJSON() << "\n";
        } 
        else if (cmd == "park") {
            // Args: park <plate> <owner> <type> <reserved>
            if (argc >= 6) {
                string plate = argv[2];
                string owner = argv[3];
                string type = argv[4];
                bool reserved = (string(argv[5]) == "1");
                cout << lot.cliParkVehicle(plate, owner, type, reserved) << "\n";
            } else {
                cout << "{\"success\": false, \"message\": \"Missing parking arguments\"}\n";
            }
        } 
        else if (cmd == "checkout") {
            // Args: checkout <slot>
            if (argc >= 3) {
                try {
                    int slot = stoi(argv[2]);
                    cout << lot.cliCheckoutVehicle(slot) << "\n";
                } catch (const exception& e) {
                    cout << "{\"success\": false, \"message\": \"Invalid slot format\"}\n";
                }
            } else {
                cout << "{\"success\": false, \"message\": \"Missing slot number\"}\n";
            }
        } 
        else if (cmd == "reset") {
            cout << lot.cliResetRevenue() << "\n";
        }
        else if (cmd == "login") {
            if (argc >= 4) {
                string username = argv[2];
                string password = argv[3];
                cout << lot.cliLogin(username, password) << "\n";
            } else {
                cout << "{\"success\": false, \"message\": \"Missing credentials\"}\n";
            }
        }
        else if (cmd == "feedback") {
            // Args: feedback <rating> <message>
            if (argc >= 4) {
                try {
                    int rating = stoi(argv[2]);
                    string message = argv[3];
                    cout << lot.cliSubmitFeedback(rating, message) << "\n";
                } catch (const exception& e) {
                    cout << "{\"success\": false, \"message\": \"Invalid rating format\"}\n";
                }
            } else {
                cout << "{\"success\": false, \"message\": \"Missing feedback data\"}\n";
            }
        }
        return 0; // Exit immediately after CLI execution
    }

    // INTERACTIVE MODE
    int choice;
    while (true) {
        cout << "\n=================================\n";
        cout << "    PARKING MANAGEMENT SYSTEM    \n";
        cout << "          (C++ BACKEND)          \n";
        cout << "=================================\n";
        cout << "1. Dashboard Overview\n";
        cout << "2. Park Vehicle\n";
        cout << "3. Checkout Vehicle\n";
        cout << "4. View Occupied Slots\n";
        cout << "5. View Revenue Tracker\n";
        cout << "6. View Log History\n";
        cout << "7. Exit Application\n";
        cout << "Enter your choice: ";
        
        if (!(cin >> choice)) {
            cin.clear();
            string junk;
            getline(cin, junk);
            cout << "[!] Invalid input. Try again.\n";
            continue;
        }

        switch (choice) {
            case 1: lot.showDashboard(); break;
            case 2: lot.parkVehicle(); break;
            case 3: lot.checkoutVehicle(); break;
            case 4: lot.showSlots(); break;
            case 5: lot.showRevenue(); break;
            case 6: lot.showHistory(); break;
            case 7: 
                cout << "\nSaving data and exiting system. Goodbye!\n";
                return 0;
            default:
                cout << "[!] Invalid choice, please try again.\n";
        }
    }
    return 0;
}
