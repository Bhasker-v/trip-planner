// dataService.js — offline-first trip data with optional live enrichment.
//
// Design:
//  * Every city ships with an offline dataset (centre coords + attractions,
//    entertainment & stays each carrying lat/lon). This guarantees distances
//    and resorts ALWAYS show, even with no network / a rate-limited key.
//  * The OpenTripMap API is used only to *augment* the offline data when it
//    happens to respond. Failure is never fatal.

window.TripDataService = (function () {
  const API_KEY = '5ae2e3f221c38a28845f05b63892ad95b6c4716363c92539b235be35';
  const PLACE_API = 'https://api.opentripmap.com/0.1/en/places';

  const CITY_LIST_CACHE = 'trip-city-list';
  const CITY_LIST_TS = 'trip-city-list-ts';
  const CACHE_TTL = 24 * 60 * 60 * 1000;

  // Curated cities. `code` is the IRCTC station code used for booking links.
  const FALLBACK_CITIES = [
    { name: 'Delhi', code: 'NDLS', station: 'New Delhi' },
    { name: 'Mumbai', code: 'BCT', station: 'Mumbai Central' },
    { name: 'Bangalore', code: 'SBC', station: 'KSR Bengaluru' },
    { name: 'Jaipur', code: 'JP', station: 'Jaipur Junction' },
    { name: 'Chennai', code: 'MAS', station: 'Chennai Central' },
    { name: 'Kolkata', code: 'HWH', station: 'Howrah' },
    { name: 'Hyderabad', code: 'HYB', station: 'Hyderabad Deccan' },
    { name: 'Pune', code: 'PUNE', station: 'Pune Junction' },
    { name: 'Ahmedabad', code: 'ADI', station: 'Ahmedabad Junction' },
    { name: 'Goa', code: 'MAO', station: 'Madgaon' },
    { name: 'Varanasi', code: 'BSB', station: 'Varanasi Junction' },
    { name: 'Kochi', code: 'ERS', station: 'Ernakulam' },
    { name: 'Udaipur', code: 'UDZ', station: 'Udaipur City' },
    { name: 'Agra', code: 'AGC', station: 'Agra Cantt' },
    { name: 'Lucknow', code: 'LKO', station: 'Lucknow Charbagh' }
  ];

  // Offline dataset per city. Coordinates are approximate (city-centre relative)
  // and only used to render a useful "X km away" figure — good enough for planning.
  const CITY_DATA = {
    delhi: {
      center: { lat: 28.6139, lon: 77.2090 },
      attractions: [
        { name: 'Qutub Minar', lat: 28.5245, lon: 77.1855 },
        { name: 'Red Fort', lat: 28.6562, lon: 77.2410 },
        { name: 'India Gate', lat: 28.6129, lon: 77.2295 },
        { name: "Humayun's Tomb", lat: 28.5933, lon: 77.2507 },
        { name: 'Lotus Temple', lat: 28.5535, lon: 77.2588 },
        { name: 'Akshardham Temple', lat: 28.6127, lon: 77.2773 }
      ],
      entertainment: [
        { name: 'Kingdom of Dreams', lat: 28.5720, lon: 77.1900 },
        { name: 'Adventure Island', lat: 28.7060, lon: 77.1220 },
        { name: 'Ambience Mall', lat: 28.5060, lon: 77.1030 }
      ],
      food: ['Butter Chicken', 'Paratha', 'Seekh Kebabs', 'Chole Bhature', 'Dal Makhani', 'Paneer Tikka', 'Rogan Josh', 'Sarson da Saag'],
      stays: {
        budget: [
          { name: 'Zostel Delhi', lat: 28.6420, lon: 77.2190 },
          { name: 'Madpackers Hostel', lat: 28.6130, lon: 77.2090 }
        ],
        premium: [
          { name: 'The Park New Delhi', lat: 28.5990, lon: 77.2260 },
          { name: 'Radisson Blu Dwarka', lat: 28.5900, lon: 77.0400 }
        ],
        luxury: [
          { name: 'Taj Mahal Hotel', lat: 28.5960, lon: 77.2210 },
          { name: 'The Leela Palace', lat: 28.5550, lon: 77.1900 }
        ]
      }
    },
    mumbai: {
      center: { lat: 19.0760, lon: 72.8777 },
      attractions: [
        { name: 'Gateway of India', lat: 18.9220, lon: 72.8347 },
        { name: 'Marine Drive', lat: 18.9440, lon: 72.8230 },
        { name: 'Elephanta Caves', lat: 18.9633, lon: 72.9315 },
        { name: 'Juhu Beach', lat: 19.0948, lon: 72.8266 },
        { name: 'CSMT Station', lat: 18.9398, lon: 72.8355 },
        { name: 'Siddhivinayak Temple', lat: 19.0170, lon: 72.8380 }
      ],
      entertainment: [
        { name: 'EsselWorld', lat: 19.2050, lon: 72.8390 },
        { name: 'SGNL Wonder Park', lat: 19.1450, lon: 72.9710 },
        { name: 'Phoenix Palladium Mall', lat: 19.0010, lon: 72.8270 }
      ],
      food: ['Vada Pav', 'Pav Bhaji', 'Seafood Thali', 'Bombay Sandwich', 'Pani Puri', 'Bhel Puri', 'Misal Pav', 'Kolhapuri Chicken'],
      stays: {
        budget: [
          { name: 'Zostel Mumbai', lat: 18.9220, lon: 72.8350 },
          { name: 'Hotel Residency Fort', lat: 18.9350, lon: 72.8360 }
        ],
        premium: [
          { name: 'Trident Nariman Point', lat: 18.9290, lon: 72.8230 },
          { name: 'Hotel Sea Shore', lat: 19.0760, lon: 72.8777 }
        ],
        luxury: [
          { name: 'Taj Mahal Palace', lat: 18.9220, lon: 72.8330 },
          { name: 'The Oberoi', lat: 18.9320, lon: 72.8260 }
        ]
      }
    },
    bangalore: {
      center: { lat: 12.9716, lon: 77.5946 },
      attractions: [
        { name: 'Lalbagh Botanical Garden', lat: 12.9507, lon: 77.5848 },
        { name: 'Cubbon Park', lat: 12.9763, lon: 77.5929 },
        { name: 'Bangalore Palace', lat: 12.9987, lon: 77.5920 },
        { name: 'ISKCON Temple', lat: 13.0102, lon: 77.5515 },
        { name: 'Nandi Hills', lat: 13.3702, lon: 77.6830 },
        { name: 'Wonderla Resort', lat: 12.8340, lon: 77.3980 }
      ],
      entertainment: [
        { name: 'Inorbit Mall', lat: 12.9960, lon: 77.7000 },
        { name: 'Fun World', lat: 12.9920, lon: 77.5980 },
        { name: 'UB City Mall', lat: 12.9719, lon: 77.5940 }
      ],
      food: ['Masala Dosa', 'Idli', 'Filter Coffee', 'Bisi Bele Bath', 'Vada', 'Upma', 'Mysore Pak', 'Chole Bhature'],
      stays: {
        budget: [
          { name: 'Zostel Bangalore', lat: 12.9750, lon: 77.6080 },
          { name: 'Hostel Explore', lat: 12.9350, lon: 77.6100 }
        ],
        premium: [
          { name: 'The Oberoi', lat: 12.9560, lon: 77.5960 },
          { name: 'ITC Gardenia', lat: 12.9720, lon: 77.5980 }
        ],
        luxury: [
          { name: 'Taj West End', lat: 12.9920, lon: 77.5900 },
          { name: 'The Leela Palace', lat: 12.9980, lon: 77.6210 }
        ]
      }
    },
    jaipur: {
      center: { lat: 26.9124, lon: 75.7873 },
      attractions: [
        { name: 'Amber Fort', lat: 26.9855, lon: 75.8513 },
        { name: 'City Palace', lat: 26.9255, lon: 75.8235 },
        { name: 'Hawa Mahal', lat: 26.9239, lon: 75.8267 },
        { name: 'Jantar Mantar', lat: 26.9248, lon: 75.8245 },
        { name: 'Nahargarh Fort', lat: 26.9377, lon: 75.8150 },
        { name: 'Johari Bazaar', lat: 26.9200, lon: 75.8300 }
      ],
      entertainment: [
        { name: 'Chokhi Dhani', lat: 26.7890, lon: 75.8310 },
        { name: 'World Trade Park', lat: 26.8990, lon: 75.8060 }
      ],
      food: ['Dal Baati Churma', 'Ghevar', 'Laal Maas', 'Kachori', 'Pyaaz Kachori', 'Mirchi Vada', 'Dal Baati', 'Churma'],
      stays: {
        budget: [
          { name: 'Zostel Jaipur', lat: 26.9080, lon: 75.8020 },
          { name: 'Hotel Pearl Palace', lat: 26.9120, lon: 75.8100 }
        ],
        premium: [
          { name: 'The Raj Palace', lat: 26.9210, lon: 75.8210 },
          { name: 'Hotel Clarks Amer', lat: 26.8900, lon: 75.7900 }
        ],
        luxury: [
          { name: 'Fairmont Jaipur', lat: 26.8300, lon: 75.7000 },
          { name: 'Rambagh Palace', lat: 26.9010, lon: 75.8140 }
        ]
      }
    },
    chennai: {
      center: { lat: 13.0827, lon: 80.2707 },
      attractions: [
        { name: 'Marina Beach', lat: 13.0500, lon: 80.2824 },
        { name: 'Fort St. George', lat: 13.0800, lon: 80.2870 },
        { name: 'Kapaleeshwarar Temple', lat: 13.0337, lon: 80.2700 },
        { name: 'Santhome Cathedral', lat: 13.0330, lon: 80.2760 },
        { name: 'Guindy National Park', lat: 13.0060, lon: 80.2210 },
        { name: 'Mahabalipuram', lat: 12.6160, lon: 80.1920 }
      ],
      entertainment: [
        { name: 'Express Avenue Mall', lat: 13.0630, lon: 80.2610 },
        { name: 'VGP Universal Kingdom', lat: 12.9060, lon: 80.2470 }
      ],
      food: ['Chettinad Chicken', 'Dosa', 'Filter Coffee', 'Meen Kuzhambu', 'Idli Sambar', 'Vada', 'Chettinad Curry', 'Filter Coffee'],
      stays: {
        budget: [
          { name: 'Zostel Chennai', lat: 13.0600, lon: 80.2500 },
          { name: 'Hotel Marina', lat: 13.0580, lon: 80.2820 }
        ],
        premium: [
          { name: 'The Park Chennai', lat: 13.0590, lon: 80.2500 },
          { name: 'Mercure Chennai', lat: 13.0820, lon: 80.2700 }
        ],
        luxury: [
          { name: 'Taj Coromandel', lat: 13.0330, lon: 80.2530 },
          { name: 'The Leela Palace', lat: 12.9760, lon: 80.2600 }
        ]
      }
    },
    kolkata: {
      center: { lat: 22.5726, lon: 88.3639 },
      attractions: [
        { name: 'Victoria Memorial', lat: 22.5448, lon: 88.3426 },
        { name: 'Howrah Bridge', lat: 22.5854, lon: 88.3430 },
        { name: 'Dakshineswar Temple', lat: 22.6560, lon: 88.3560 },
        { name: 'Indian Museum', lat: 22.5583, lon: 88.3510 },
        { name: 'Park Street', lat: 22.5530, lon: 88.3510 },
        { name: 'Science City', lat: 22.5400, lon: 88.3670 }
      ],
      entertainment: [
        { name: 'South City Mall', lat: 22.5090, lon: 88.3660 },
        { name: 'Nicco Park', lat: 22.5650, lon: 88.4180 }
      ],
      food: ['Kathi Roll', 'Rosogolla', 'Fish Curry', 'Mishti Doi'],
      stays: {
        budget: [
          { name: 'Zostel Kolkata', lat: 22.5620, lon: 88.3510 },
          { name: 'Hotel Cloud Seven', lat: 22.5560, lon: 88.3510 }
        ],
        premium: [
          { name: 'The Park Kolkata', lat: 22.5550, lon: 88.3510 },
          { name: 'Hyatt Regency', lat: 22.5700, lon: 88.4100 }
        ],
        luxury: [
          { name: 'The Oberoi Grand', lat: 22.5550, lon: 88.3510 },
          { name: 'Taj Bengal', lat: 22.5330, lon: 88.3480 }
        ]
      }
    },
    hyderabad: {
      center: { lat: 17.3850, lon: 78.4867 },
      attractions: [
        { name: 'Charminar', lat: 17.3616, lon: 78.4747 },
        { name: 'Golconda Fort', lat: 17.3833, lon: 78.4011 },
        { name: 'Hussain Sagar Lake', lat: 17.4239, lon: 78.4738 },
        { name: 'Ramoji Film City', lat: 17.2543, lon: 78.6808 },
        { name: 'Salar Jung Museum', lat: 17.3710, lon: 78.4800 },
        { name: 'Qutb Shahi Tombs', lat: 17.3970, lon: 78.4030 }
      ],
      entertainment: [
        { name: 'Inorbit Mall', lat: 17.4370, lon: 78.3740 },
        { name: 'Snow World', lat: 17.4310, lon: 78.4480 }
      ],
      food: ['Hyderabadi Biryani', 'Haleem', 'Kebabs', 'Irani Chai'],
      stays: {
        budget: [
          { name: 'Zostel Hyderabad', lat: 17.3830, lon: 78.4650 },
          { name: 'Hotel Minerva', lat: 17.3890, lon: 78.4690 }
        ],
        premium: [
          { name: 'Novotel HICC', lat: 17.4360, lon: 78.3480 },
          { name: 'Taj Falaknuma', lat: 17.3310, lon: 78.4300 }
        ],
        luxury: [
          { name: 'ITC Kohenur', lat: 17.4310, lon: 78.4010 },
          { name: 'Taj Banjara', lat: 17.4100, lon: 78.4300 }
        ]
      }
    },
    pune: {
      center: { lat: 18.5204, lon: 73.8567 },
      attractions: [
        { name: 'Shaniwar Wada', lat: 18.5195, lon: 73.8553 },
        { name: 'Aga Khan Palace', lat: 18.5520, lon: 73.9030 },
        { name: 'Sinhagad Fort', lat: 18.3490, lon: 73.7600 },
        { name: 'Lonavala', lat: 18.7490, lon: 73.4070 },
        { name: 'Dagdusheth Ganpati', lat: 18.5200, lon: 73.8540 },
        { name: 'Osho International', lat: 18.5360, lon: 73.8940 }
      ],
      entertainment: [
        { name: 'Phoenix Marketcity', lat: 18.5600, lon: 73.9140 },
        { name: 'Adlabs Imagica', lat: 18.7000, lon: 73.4000 }
      ],
      food: ['Misal Pav', 'Pithale Bhakri', 'Vada Pav', 'Bakharwadi'],
      stays: {
        budget: [
          { name: 'Zostel Pune', lat: 18.5300, lon: 73.8700 },
          { name: 'Hotel Shadab', lat: 18.5250, lon: 73.8560 }
        ],
        premium: [
          { name: 'Hyatt Regency', lat: 18.5300, lon: 73.8900 },
          { name: 'Crowne Plaza', lat: 18.5340, lon: 73.9200 }
        ],
        luxury: [
          { name: 'JW Marriott', lat: 18.5310, lon: 73.8740 },
          { name: 'The Westin', lat: 18.5900, lon: 73.7300 }
        ]
      }
    },
    ahmedabad: {
      center: { lat: 23.0225, lon: 72.5714 },
      attractions: [
        { name: 'Sabarmati Ashram', lat: 23.0610, lon: 72.5800 },
        { name: 'Adalaj Stepwell', lat: 23.1660, lon: 72.5800 },
        { name: 'Kankaria Lake', lat: 23.0070, lon: 72.6070 },
        { name: 'Atal Bridge', lat: 23.0300, lon: 72.5800 },
        { name: 'Science City', lat: 23.0950, lon: 72.5550 },
        { name: 'Rani ki Vav', lat: 23.6970, lon: 72.1300 }
      ],
      entertainment: [
        { name: 'AlphaOne Mall', lat: 23.0300, lon: 72.5600 },
        { name: 'Law Garden', lat: 23.0260, lon: 72.5830 }
      ],
      food: ['Gujarati Thali', 'Dhokla', 'Fafda Jalebi', 'Khandvi'],
      stays: {
        budget: [
          { name: 'Zostel Ahmedabad', lat: 23.0250, lon: 72.5700 },
          { name: 'Hotel Emissive', lat: 23.0210, lon: 72.5700 }
        ],
        premium: [
          { name: 'Hyatt Regency', lat: 23.0500, lon: 72.5000 },
          { name: 'Novotel SG', lat: 23.0300, lon: 72.5000 }
        ],
        luxury: [
          { name: 'ITC Narmada', lat: 23.0300, lon: 72.5400 },
          { name: 'The Leela Palace', lat: 23.0600, lon: 72.5000 }
        ]
      }
    },
    goa: {
      center: { lat: 15.4909, lon: 73.8278 },
      attractions: [
        { name: 'Calangute Beach', lat: 15.5440, lon: 73.7550 },
        { name: 'Fort Aguada', lat: 15.4920, lon: 73.7730 },
        { name: 'Baga Beach', lat: 15.5560, lon: 73.7510 },
        { name: 'Dudhsagar Falls', lat: 15.3144, lon: 74.3144 },
        { name: 'Old Goa Churches', lat: 15.5010, lon: 73.9110 },
        { name: 'Anjuna Flea Market', lat: 15.5780, lon: 73.7400 }
      ],
      entertainment: [
        { name: 'Deltin Royale Casino', lat: 15.4980, lon: 73.8270 },
        { name: 'Majorda Beach Resort', lat: 15.4300, lon: 73.8300 }
      ],
      food: ['Goan Fish Curry', 'Prawn Balchão', 'Vindaloo', 'Bebinca'],
      stays: {
        budget: [
          { name: 'Zostel Goa', lat: 15.5490, lon: 73.7600 },
          { name: 'Hostel 64', lat: 15.5040, lon: 73.8170 }
        ],
        premium: [
          { name: 'Taj Fort Aguada', lat: 15.4930, lon: 73.7720 },
          { name: 'Goa Marriott', lat: 15.5440, lon: 73.7510 }
        ],
        luxury: [
          { name: 'W Goa', lat: 15.5600, lon: 73.7400 },
          { name: 'Taj Exotica', lat: 15.4200, lon: 73.7600 }
        ]
      }
    },
    varanasi: {
      center: { lat: 25.3176, lon: 82.9739 },
      attractions: [
        { name: 'Kashi Vishwanath Temple', lat: 25.3109, lon: 83.0107 },
        { name: 'Dashashwamedh Ghat Aarti', lat: 25.3050, lon: 83.0200 },
        { name: 'Assi Ghat', lat: 25.2860, lon: 83.0080 },
        { name: 'Sarnath', lat: 25.3810, lon: 83.0240 },
        { name: 'Manikarnika Ghat', lat: 25.3100, lon: 83.0100 },
        { name: 'Ramnagar Fort', lat: 25.3300, lon: 83.0300 }
      ],
      entertainment: [
        { name: 'Godowlia Market', lat: 25.3100, lon: 83.0100 },
        { name: 'JHV Mall', lat: 25.3200, lon: 82.9750 }
      ],
      food: ['Kachori Sabzi', 'Banarasi Paan', 'Malaiyo', 'Thandai'],
      stays: {
        budget: [
          { name: 'Zostel Varanasi', lat: 25.2870, lon: 83.0080 },
          { name: 'Hotel Ganges', lat: 25.3080, lon: 83.0090 }
        ],
        premium: [
          { name: 'BrijRama Palace', lat: 25.3070, lon: 83.0110 },
          { name: 'Hotel Surya', lat: 25.3300, lon: 82.9700 }
        ],
        luxury: [
          { name: 'Taj Ganges', lat: 25.3300, lon: 82.9600 },
          { name: 'Radisson Hotel', lat: 25.3400, lon: 82.9900 }
        ]
      }
    },
    kochi: {
      center: { lat: 9.9312, lon: 76.2673 },
      attractions: [
        { name: 'Fort Kochi', lat: 9.9658, lon: 76.2422 },
        { name: 'Chinese Fishing Nets', lat: 9.9670, lon: 76.2430 },
        { name: 'Mattancherry Palace', lat: 9.9570, lon: 76.2590 },
        { name: 'Marine Drive', lat: 9.9800, lon: 76.2760 },
        { name: 'Kathakali Centre', lat: 9.9750, lon: 76.2700 },
        { name: 'Lulu Mall', lat: 9.9920, lon: 76.2990 }
      ],
      entertainment: [
        { name: 'Marine Drive Boat Ride', lat: 9.9800, lon: 76.2760 },
        { name: 'Wonderla Kochi', lat: 10.1000, lon: 76.3500 }
      ],
      food: ['Kerala Sadhya', 'Appam & Stew', 'Karimeen', 'Puttu Kadala'],
      stays: {
        budget: [
          { name: 'Zostel Kochi', lat: 9.9650, lon: 76.2420 },
          { name: 'Old Harbour Hotel', lat: 9.9670, lon: 76.2420 }
        ],
        premium: [
          { name: 'Taj Malabar', lat: 9.9830, lon: 76.2770 },
          { name: 'Crowne Plaza', lat: 9.9680, lon: 76.2420 }
        ],
        luxury: [
          { name: 'Kochi Marriott', lat: 9.9930, lon: 76.2990 },
          { name: 'Fragrant Nature', lat: 9.9620, lon: 76.2640 }
        ]
      }
    },
    udaipur: {
      center: { lat: 24.5854, lon: 73.7125 },
      attractions: [
        { name: 'City Palace', lat: 24.5765, lon: 73.6900 },
        { name: 'Lake Pichola', lat: 24.5700, lon: 73.6800 },
        { name: 'Jag Mandir Island', lat: 24.5600, lon: 73.6800 },
        { name: 'Saheliyon ki Bari', lat: 24.5900, lon: 73.6900 },
        { name: 'Fateh Sagar Lake', lat: 24.6000, lon: 73.6700 },
        { name: 'Monsoon Palace', lat: 24.5650, lon: 73.6500 }
      ],
      entertainment: [
        { name: 'Bagore ki Haveli Show', lat: 24.5730, lon: 73.6810 },
        { name: 'Shilpgram', lat: 24.5600, lon: 73.6800 }
      ],
      food: ['Dal Baati', 'Gatte ki Sabzi', 'Kachori', 'Mawa Kachori'],
      stays: {
        budget: [
          { name: 'Zostel Udaipur', lat: 24.5870, lon: 73.7120 },
          { name: 'Hotel Amet', lat: 24.5760, lon: 73.6900 }
        ],
        premium: [
          { name: 'The LaLiT', lat: 24.5900, lon: 73.6800 },
          { name: 'Hotel Jagat Niwas', lat: 24.5730, lon: 73.6820 }
        ],
        luxury: [
          { name: 'Taj Lake Palace', lat: 24.5700, lon: 73.6800 },
          { name: 'The Oberoi Udaivilas', lat: 24.5600, lon: 73.6600 }
        ]
      }
    },
    agra: {
      center: { lat: 27.1767, lon: 78.0081 },
      attractions: [
        { name: 'Taj Mahal', lat: 27.1751, lon: 78.0421 },
        { name: 'Agra Fort', lat: 27.1800, lon: 78.0220 },
        { name: 'Fatehpur Sikri', lat: 27.0945, lon: 77.6678 },
        { name: 'Mehtab Bagh', lat: 27.1800, lon: 78.0500 },
        { name: "Itmad-ud-Daula", lat: 27.1910, lon: 78.0280 },
        { name: "Akbar's Tomb", lat: 27.0560, lon: 78.0300 }
      ],
      entertainment: [
        { name: 'Sadar Bazaar', lat: 27.1800, lon: 78.0000 },
        { name: 'Wake Up Agra', lat: 27.1760, lon: 78.0080 }
      ],
      food: ['Petha', 'Dalmoth', 'Bedai Jalebi', 'Mughlai cuisine'],
      stays: {
        budget: [
          { name: 'Zostel Agra', lat: 27.1800, lon: 78.0100 },
          { name: 'Hotel Atulyaa', lat: 27.1790, lon: 78.0120 }
        ],
        premium: [
          { name: 'Jaypee Palace', lat: 27.1600, lon: 78.0000 },
          { name: 'ITC Mughal', lat: 27.1580, lon: 78.0130 }
        ],
        luxury: [
          { name: 'Oberoi Amarvilas', lat: 27.1720, lon: 78.0420 },
          { name: 'The Trident', lat: 27.1750, lon: 78.0400 }
        ]
      }
    },
    lucknow: {
      center: { lat: 26.8467, lon: 80.9462 },
      attractions: [
        { name: 'Bara Imambara', lat: 26.8690, lon: 80.9140 },
        { name: 'Chota Imambara', lat: 26.8720, lon: 80.9110 },
        { name: 'Rumi Darwaza', lat: 26.8700, lon: 80.9120 },
        { name: 'Hussainabad Clock Tower', lat: 26.8690, lon: 80.9100 },
        { name: 'British Residency', lat: 26.8570, lon: 80.9150 },
        { name: 'Ambedkar Park', lat: 26.8500, lon: 80.9460 }
      ],
      entertainment: [
        { name: 'Hazratganj Market', lat: 26.8460, lon: 80.9460 },
        { name: 'Phoenix United Mall', lat: 26.8300, lon: 81.0000 }
      ],
      food: ['Awadhi Biryani', 'Galouti Kebab', 'Tunday Kebab', 'Shahi Tukda'],
      stays: {
        budget: [
          { name: 'Zostel Lucknow', lat: 26.8470, lon: 80.9300 },
          { name: 'Hotel Gomti', lat: 26.8500, lon: 80.9500 }
        ],
        premium: [
          { name: 'Novotel Lucknow', lat: 26.8200, lon: 80.9800 },
          { name: 'Hotel Clarks Avadh', lat: 26.8460, lon: 80.9460 }
        ],
        luxury: [
          { name: 'Taj Lucknow', lat: 26.8400, lon: 80.9400 },
          { name: 'The Leela Palace', lat: 26.8500, lon: 80.9200 }
        ]
      }
    }
  };

  const normalize = (c) => String(c || '').toLowerCase().trim().replace(/\s+/g, '-');

  // ---- Caching ----
  function cacheGet(key) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function cacheSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full */ }
  }

  async function fetchJson(url, timeoutMs = 8000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  // ---- Distance (haversine) ----
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  const fmtDist = (km) => km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  const mapsLink = (name, city) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' ' + city)}`;

  // Resolve city centre: try live geocode, else offline coords, else generic.
  async function getCityCenter(cityName) {
    const key = normalize(cityName);
    const offline = CITY_DATA[key]?.center;
    try {
      const geo = await fetchJson(`${PLACE_API}/geoname?apikey=${API_KEY}&name=${encodeURIComponent(cityName)}&format=json`);
      const place = Array.isArray(geo) ? geo[0] : geo;
      if (place && typeof place.lat === 'number') {
        return { lat: place.lat, lon: place.lon, name: place.name || cityName, live: true };
      }
    } catch (e) { /* offline — use offline coords */ }
    if (offline) return { lat: offline.lat, lon: offline.lon, name: cityName, live: false };
    return { lat: 0, lon: 0, name: cityName, live: false };
  }

  // Build a normalized place record from an offline {name,lat,lon} entry.
  const toPlace = (e, type, center, cityName) => {
    const d = (typeof e.lat === 'number') ? haversine(center.lat, center.lon, e.lat, e.lon) : null;
    return {
      name: e.name, type, lat: e.lat, lon: e.lon,
      distance: d, distanceText: d == null ? '' : fmtDist(d),
      link: mapsLink(e.name, cityName), curated: true
    };
  };

  // ---- City list (live-augmented, cached) ----
  async function getCityList({ forceRefresh = false } = {}) {
    const cached = cacheGet(CITY_LIST_CACHE);
    const ts = parseInt(localStorage.getItem(CITY_LIST_TS) || '0', 10);
    if (cached && cached.length && !forceRefresh && (Date.now() - ts) < CACHE_TTL) return cached;

    // Merge offline curated cities with any live Indian cities we can fetch.
    let live = null;
    try {
      const data = await fetchJson(`${PLACE_API.replace('/places', '/cities')}?apikey=${API_KEY}&format=json&kind=town&limit=50&name=india`);
      if (Array.isArray(data) && data.length) {
        live = data.map(c => ({ name: c.name || '', code: '', station: c.name || '' })).filter(c => c.name);
      }
    } catch (e) { /* offline */ }

    const merged = FALLBACK_CITIES.slice();
    if (live) {
      const seen = new Set(merged.map(c => normalize(c.name)));
      live.forEach(c => { if (!seen.has(normalize(c.name))) { merged.push(c); seen.add(normalize(c.name)); } });
    }
    cacheSet(CITY_LIST_CACHE, merged);
    localStorage.setItem(CITY_LIST_TS, Date.now().toString());
    return merged;
  }

  // ---- City details (attractions / food / stays) ----
  async function getCityDetails(cityName) {
    const key = normalize(cityName);
    const d = CITY_DATA[key];
    if (d) return { name: cityName, attractions: d.attractions.map(a => a.name), food: d.food, stays: d.stays };
    return { name: cityName, attractions: ['Local sightseeing', 'City market', 'Famous landmark'], food: ['Local specialty'], stays: { budget: [{ name: 'Local Inn' }], premium: [{ name: 'City Hotel' }], luxury: [{ name: 'Luxury Resort' }] } };
  }

  // ---- Unified trip options: resorts, entertainment, attractions, food ----
  // Always offline-capable. Live results (when available) are merged in.
  async function getTripOptions(cityName, { radiusKm = 50 } = {}) {
    const key = normalize(cityName);
    const data = CITY_DATA[key];
    const center = await getCityCenter(cityName);

    // 1) Offline baseline with computed distances.
    const groups = { resort: [], entertainment: [], attraction: [], food: [] };
    if (data) {
      ['budget', 'premium', 'luxury'].forEach(level => {
        (data.stays[level] || []).forEach(s =>
          groups.resort.push({ ...toPlace(s, 'Resort', center, cityName), level }));
      });
      (data.entertainment || []).forEach(e => groups.entertainment.push(toPlace(e, 'Entertainment', center, cityName)));
      (data.attractions || []).forEach(a => groups.attraction.push(toPlace(a, 'Attraction', center, cityName)));
      groups.food = (data.food || []).map(f => ({ name: f, type: 'Food', curated: true, link: mapsLink(f, cityName) }));
    }

    let liveUsed = false;
    // 2) Live enrichment — best effort, never required.
    if (center.live) {
      try {
        const places = await fetchJson(`${PLACE_API}/radius?apikey=${API_KEY}&radius=${radiusKm * 1000}&lon=${center.lon}&lat=${center.lat}&limit=50&format=json`);
        if (Array.isArray(places)) {
          liveUsed = true;
          const known = new Set([
            ...groups.resort, ...groups.entertainment, ...groups.attraction
          ].map(p => normalize(p.name)));
          places.filter(p => p && p.name && p.name.length > 2).forEach(p => {
            const kinds = (Array.isArray(p.kinds) ? p.kinds.join(',') : (p.kinds || '')).toLowerCase();
            const d = haversine(center.lat, center.lon, p.lat, p.lon);
            const rec = {
              name: p.name, lat: p.lat, lon: p.lon, distance: d, distanceText: fmtDist(d),
              link: mapsLink(p.name, cityName), curated: false
            };
            if (normalize(p.name) in known) return;
            let bucket = null;
            if (kinds.includes('resort') || kinds.includes('hotel') || kinds.includes('hostel') || kinds.includes('guest_house')) { rec.type = 'Resort'; rec.level = 'live'; bucket = groups.resort; }
            else if (kinds.includes('theater') || kinds.includes('cinema') || kinds.includes('theme_park') || kinds.includes('amusement') || kinds.includes('zoo') || kinds.includes('aquarium') || kinds.includes('casino') || kinds.includes('mall')) { rec.type = 'Entertainment'; bucket = groups.entertainment; }
            else if (kinds.includes('restaurant') || kinds.includes('cafe') || kinds.includes('bar')) { rec.type = 'Food'; bucket = groups.food; }
            else if (kinds.includes('museum') || kinds.includes('gallery') || kinds.includes('monument') || kinds.includes('historic') || kinds.includes('landmark') || kinds.includes('natural')) { rec.type = 'Attraction'; bucket = groups.attraction; }
            if (bucket) { bucket.push(rec); known.add(normalize(p.name)); }
          });
        }
      } catch (e) { /* rate-limited / offline — offline data already stands in */ }
    }

    // 3) Sort place-groups nearest-first (food has no distance).
    ['resort', 'entertainment', 'attraction'].forEach(g =>
      groups[g].sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9)));

    return { city: cityName, center, source: liveUsed ? 'live' : 'curated', groups };
  }

  function lastUpdated() {
    const ts = parseInt(localStorage.getItem(CITY_LIST_TS) || '0', 10);
    return ts ? new Date(ts) : null;
  }

  return {
    getCityList, getCityDetails, getCityCenter, getTripOptions,
    lastUpdated, FALLBACK_CITIES, CITY_DATA, normalize, haversine, fmtDist
  };
})();
