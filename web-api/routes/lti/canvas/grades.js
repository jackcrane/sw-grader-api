import express from "express";

const textParser = express.text({ type: "*/*" });

const logGradeRequest = (req) => {
  console.log("[Canvas LTI] Grade passback headers:", req.headers);
  console.log("[Canvas LTI] Grade passback body:", req.body);
};

const buildSuccessEnvelope = (messageIdentifier) => `<?xml version="1.0" encoding="UTF-8"?>
<imsx_POXEnvelopeResponse xmlns="http://www.imsglobal.org/lis/oms1p0/pox">
  <imsx_POXHeader>
    <imsx_POXResponseHeaderInfo>
      <imsx_version>V1.0</imsx_version>
      <imsx_messageIdentifier>${messageIdentifier}</imsx_messageIdentifier>
      <imsx_statusInfo>
        <imsx_codeMajor>success</imsx_codeMajor>
        <imsx_severity>status</imsx_severity>
        <imsx_description>grade receipt logged</imsx_description>
        <imsx_messageRefIdentifier>${messageIdentifier}</imsx_messageRefIdentifier>
      </imsx_statusInfo>
    </imsx_POXResponseHeaderInfo>
  </imsx_POXHeader>
  <imsx_POXBody>
    <replaceResultResponse/>
  </imsx_POXBody>
</imsx_POXEnvelopeResponse>`;

export const post = [
  textParser,
  (req, res) => {
    logGradeRequest(req);

    const messageIdentifierMatch = req.body
      ? req.body.match(/<imsx_messageIdentifier>([^<]+)<\/imsx_messageIdentifier>/i)
      : null;
    const identifier =
      messageIdentifierMatch?.[1]?.trim() ||
      `featurebench-${Date.now()}`;

    res
      .status(200)
      .type("application/xml")
      .send(buildSuccessEnvelope(identifier));
  },
];
