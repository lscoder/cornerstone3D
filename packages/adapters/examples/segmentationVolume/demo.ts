const dicomMap = new Map();

// MED_LYMPH_001
dicomMap.set("61.7.110976287009623783394893059131426578073", {
    fetchDicom: {
        StudyInstanceUID: "61.7.110976287009623783394893059131426578073",
        SeriesInstanceUID: "61.7.186195007319014217251157852440977945371",
        wadoRsRoot: "http://localhost/dicom-web/"
        // wadoRsRoot: "http://localhost:5000/dicomweb"
    },
    fetchSegmentation: {
        StudyInstanceUID: "61.7.110976287009623783394893059131426578073",
        SeriesInstanceUID:
            "1.2.276.0.7230010.3.1.3.296485376.2527.1716206360.73915",
        SOPInstanceUID:
            "1.2.276.0.7230010.3.1.4.296485376.2527.1716206360.73916",
        wadoRsRoot: "http://localhost/dicom-web/"
        // wadoRsRoot: "http://localhost:5000/dicomweb"
    },
    fetchParametricMap: {
        StudyInstanceUID: "61.7.110976287009623783394893059131426578073",
        SeriesInstanceUID:
            "1.2.276.0.7230010.3.1.3.296485376.2553.1716206362.621624",
        SOPInstanceUID:
            "1.2.276.0.7230010.3.1.4.296485376.2553.1716206362.621625",
        wadoRsRoot: "http://localhost/dicom-web/"
        // wadoRsRoot: "http://localhost:5000/dicomweb"
    }
});

dicomMap.set(
    "1.3.6.1.4.1.14519.5.2.1.256467663913010332776401703474716742458",
    {
        fetchDicom: {
            StudyInstanceUID:
                "1.3.6.1.4.1.14519.5.2.1.256467663913010332776401703474716742458",
            SeriesInstanceUID:
                "1.3.6.1.4.1.14519.5.2.1.40445112212390159711541259681923198035",
            wadoRsRoot: "https://d33do7qe4w26qo.cloudfront.net/dicomweb"
        },
        fetchSegmentation: {
            StudyInstanceUID:
                "1.3.6.1.4.1.14519.5.2.1.256467663913010332776401703474716742458",
            SeriesInstanceUID:
                "1.2.276.0.7230010.3.1.3.481034752.2667.1663086918.611582",
            SOPInstanceUID:
                "1.2.276.0.7230010.3.1.4.481034752.2667.1663086918.611583",
            wadoRsRoot: "https://d33do7qe4w26qo.cloudfront.net/dicomweb"
        }
    }
);
dicomMap.set("1.3.12.2.1107.5.2.32.35162.30000015050317233592200000046", {
    fetchDicom: {
        StudyInstanceUID:
            "1.3.12.2.1107.5.2.32.35162.30000015050317233592200000046",
        SeriesInstanceUID:
            "1.3.12.2.1107.5.2.32.35162.1999123112191238897317963.0.0.0",
        wadoRsRoot: "https://d33do7qe4w26qo.cloudfront.net/dicomweb"
    },
    fetchSegmentation: {
        StudyInstanceUID:
            "1.3.12.2.1107.5.2.32.35162.30000015050317233592200000046",
        SeriesInstanceUID:
            "1.2.276.0.7230010.3.1.3.296485376.8.1542816659.201008",
        SOPInstanceUID: "1.2.276.0.7230010.3.1.4.296485376.8.1542816659.201009",
        wadoRsRoot: "https://d33do7qe4w26qo.cloudfront.net/dicomweb"
    }
});

export { dicomMap };
