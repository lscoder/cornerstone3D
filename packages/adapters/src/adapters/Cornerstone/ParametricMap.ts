import {
    log,
    data as dcmjsData,
    utilities,
    normalizers,
    derivations
} from "dcmjs";
// import ndarray from "ndarray";

const { DicomMessage, DicomMetaDictionary } = dcmjsData;
const { Normalizer } = normalizers;
const { /* ParametricMap: ParametricMapDerivation, */ DerivedPixels } =
    derivations;
const { decode } = utilities.compression;
const {
    rotateDirectionCosinesInPlane,
    flipImageOrientationPatient: flipIOP,
    // flipMatrix2D,
    // rotateMatrix902D,
    nearlyEqual
} = utilities.orientation;

// TODO: This should be in dcmjs
class ParametricMap extends DerivedPixels {
    constructor(datasets, options = {}) {
        super(datasets, options);
    }

    // this assumes a normalized multiframe input and will create a multiframe derived image
    derive() {
        super.derive();
        console.log(
            ">>>>> ParametricMapStorage:",
            DicomMetaDictionary.sopClassUIDsByName.ParametricMapStorage
        );

        this.assignToDataset({
            SOPClassUID:
                DicomMetaDictionary.sopClassUIDsByName.ParametricMapStorage ??
                "1.2.840.10008.5.1.4.1.1.30"
        });

        // this.assignFromReference([]);
    }
}

function generateParametricMap(images, pixelData, userOptions = {}) {
    const isMultiframe = images[0].imageId.includes("?frame");
    const parametricMap = _deriveDatasetFromImages(
        images,
        isMultiframe,
        userOptions
    );

    parametricMap.PixelData = pixelData;

    return parametricMap;
}

// TODO: Move it to a shared file and replace `_createSegFromImages` in Segmentation_4x.js
function _deriveDatasetFromImages(images, isMultiframe, options) {
    const datasets = [];

    if (isMultiframe) {
        const image = images[0];
        const arrayBuffer = image.data.byteArray.buffer;

        const dicomData = DicomMessage.readFile(arrayBuffer);
        const dataset = DicomMetaDictionary.naturalizeDataset(dicomData.dict);

        dataset._meta = DicomMetaDictionary.namifyDataset(dicomData.meta);
        dataset.SpecificCharacterSet = "ISO_IR 192";
        datasets.push(dataset);
    } else {
        for (let i = 0; i < images.length; i++) {
            const image = images[i];
            const arrayBuffer = image.data.byteArray.buffer;
            const dicomData = DicomMessage.readFile(arrayBuffer);
            const dataset = DicomMetaDictionary.naturalizeDataset(
                dicomData.dict
            );

            dataset._meta = DicomMetaDictionary.namifyDataset(dicomData.meta);
            dataset.SpecificCharacterSet = "ISO_IR 192";
            datasets.push(dataset);
        }
    }

    const multiframe = Normalizer.normalizeToDataset(datasets);

    // return new ParametricMapDerivation([multiframe], options);
    return new ParametricMap([multiframe], options);
}

async function generateToolState(
    imageIds,
    arrayBuffer,
    metadataProvider,
    tolerance = 1e-3
) {
    const dicomData = DicomMessage.readFile(arrayBuffer);
    const dataset = DicomMetaDictionary.naturalizeDataset(dicomData.dict);
    dataset._meta = DicomMetaDictionary.namifyDataset(dicomData.meta);
    const multiframe = Normalizer.normalizeToDataset([dataset]);
    const imagePlaneModule = metadataProvider.get(
        "imagePlaneModule",
        imageIds[0]
    );

    if (!imagePlaneModule) {
        console.warn("Insufficient metadata, imagePlaneModule missing.");
    }

    const ImageOrientationPatient = Array.isArray(imagePlaneModule.rowCosines)
        ? [...imagePlaneModule.rowCosines, ...imagePlaneModule.columnCosines]
        : [
              imagePlaneModule.rowCosines.x,
              imagePlaneModule.rowCosines.y,
              imagePlaneModule.rowCosines.z,
              imagePlaneModule.columnCosines.x,
              imagePlaneModule.columnCosines.y,
              imagePlaneModule.columnCosines.z
          ];

    // Get IOP from ref series, compute supported orientations:
    const validOrientations = getValidOrientations(ImageOrientationPatient);

    const TransferSyntaxUID = multiframe._meta.TransferSyntaxUID.Value[0];

    let pixelData;

    // TODO: Confirm if this is needed for parametric maps
    if (TransferSyntaxUID === "1.2.840.10008.1.2.5") {
        const rleEncodedFrames = Array.isArray(multiframe.PixelData)
            ? multiframe.PixelData
            : [multiframe.PixelData];

        pixelData = decode(
            rleEncodedFrames,
            multiframe.Rows,
            multiframe.Columns
        );

        if (multiframe.BitsStored === 1) {
            console.warn("No implementation for rle + bitbacking.");
            return;
        }
    } else {
        pixelData = getPixelData(multiframe);
    }

    const orientation = checkOrientation(
        multiframe,
        validOrientations,
        [imagePlaneModule.rows, imagePlaneModule.columns, imageIds.length],
        tolerance
    );

    // Pre-compute the sop UID to imageId index map so that in the for loop
    // we don't have to call metadataProvider.get() for each imageId over
    // and over again.
    const sopUIDImageIdIndexMap = imageIds.reduce((acc, imageId) => {
        const { sopInstanceUID } = metadataProvider.get(
            "generalImageModule",
            imageId
        );
        acc[sopInstanceUID] = imageId;
        return acc;
    }, {});

    if (orientation !== "Planar") {
        const orientationText = {
            Perpendicular: "orthogonal",
            Oblique: "oblique"
        };

        throw new Error(
            `Parametric maps ${orientationText[orientation]} to the acquisition plane of the source data are not yet supported.`
        );
    }

    // Pre-compute the indices and metadata so that we don't have to call
    // a function for each imageId in the for loop.
    const imageIdMaps = imageIds.reduce(
        (acc, curr, index) => {
            acc.indices[curr] = index;
            acc.metadata[curr] = metadataProvider.get("instance", curr);
            return acc;
        },
        { indices: {}, metadata: {} }
    );

    await insertPixelDataPlanar(
        pixelData,
        multiframe,
        imageIds,
        validOrientations,
        metadataProvider,
        tolerance,
        sopUIDImageIdIndexMap,
        imageIdMaps
    );

    return { pixelData };
}

function findReferenceSourceImageId(
    multiframe,
    frameSegment,
    imageIds,
    metadataProvider,
    tolerance,
    sopUIDImageIdIndexMap
) {
    let imageId = undefined;

    if (!multiframe) {
        return imageId;
    }

    const {
        FrameOfReferenceUID,
        PerFrameFunctionalGroupsSequence,
        SourceImageSequence,
        ReferencedSeriesSequence
    } = multiframe;

    if (
        !PerFrameFunctionalGroupsSequence ||
        PerFrameFunctionalGroupsSequence.length === 0
    ) {
        return imageId;
    }

    const PerFrameFunctionalGroup =
        PerFrameFunctionalGroupsSequence[frameSegment];

    if (!PerFrameFunctionalGroup) {
        return imageId;
    }

    let frameSourceImageSequence = undefined;
    if (PerFrameFunctionalGroup.DerivationImageSequence) {
        let DerivationImageSequence =
            PerFrameFunctionalGroup.DerivationImageSequence;
        if (Array.isArray(DerivationImageSequence)) {
            if (DerivationImageSequence.length !== 0) {
                DerivationImageSequence = DerivationImageSequence[0];
            } else {
                DerivationImageSequence = undefined;
            }
        }

        if (DerivationImageSequence) {
            frameSourceImageSequence =
                DerivationImageSequence.SourceImageSequence;
            if (Array.isArray(frameSourceImageSequence)) {
                if (frameSourceImageSequence.length !== 0) {
                    frameSourceImageSequence = frameSourceImageSequence[0];
                } else {
                    frameSourceImageSequence = undefined;
                }
            }
        }
    } else if (SourceImageSequence && SourceImageSequence.length !== 0) {
        console.warn(
            "DerivationImageSequence not present, using SourceImageSequence assuming SEG has the same geometry as the source image."
        );
        frameSourceImageSequence = SourceImageSequence[frameSegment];
    }

    if (frameSourceImageSequence) {
        imageId = getImageIdOfSourceImageBySourceImageSequence(
            frameSourceImageSequence,
            sopUIDImageIdIndexMap
        );
    }

    if (imageId === undefined && ReferencedSeriesSequence) {
        const referencedSeriesSequence = Array.isArray(ReferencedSeriesSequence)
            ? ReferencedSeriesSequence[0]
            : ReferencedSeriesSequence;
        const ReferencedSeriesInstanceUID =
            referencedSeriesSequence.SeriesInstanceUID;

        imageId = getImageIdOfSourceImagebyGeometry(
            ReferencedSeriesInstanceUID,
            FrameOfReferenceUID,
            PerFrameFunctionalGroup,
            imageIds,
            metadataProvider,
            tolerance
        );
    }

    return imageId;
}

function insertPixelDataPlanar(
    sourcePixelData,
    multiframe,
    imageIds,
    validOrientations,
    metadataProvider,
    tolerance,
    sopUIDImageIdIndexMap,
    imageIdMaps
) {
    const targetPixelData = new sourcePixelData.constructor(
        sourcePixelData.length
    );

    const {
        // SharedFunctionalGroupsSequence,
        PerFrameFunctionalGroupsSequence,
        Rows,
        Columns
    } = multiframe;

    // const sharedImageOrientationPatient =
    //     SharedFunctionalGroupsSequence.PlaneOrientationSequence
    //         ? SharedFunctionalGroupsSequence.PlaneOrientationSequence
    //               .ImageOrientationPatient
    //         : undefined;

    const sliceLength = Columns * Rows;
    const numSlices = PerFrameFunctionalGroupsSequence.length;

    for (let i = 0; i < numSlices; i++) {
        // const PerFrameFunctionalGroups = PerFrameFunctionalGroupsSequence[i];

        // const ImageOrientationPatientI =
        //     sharedImageOrientationPatient ||
        //     PerFrameFunctionalGroups.PlaneOrientationSequence
        //         .ImageOrientationPatient;

        const sourceSliceDataView = new sourcePixelData.constructor(
            sourcePixelData.buffer,
            i * sliceLength,
            sliceLength
        );

        // const sourceSliceData = ndarray(sourceSliceDataView, [Rows, Columns]);
        //
        // const alignedSourceSliceData = alignPixelDataWithSourceData(
        //     sourceSliceData,
        //     ImageOrientationPatientI,
        //     validOrientations,
        //     tolerance
        // );
        //
        // if (!alignedSourceSliceData) {
        //     throw new Error(
        //         "Individual PMAP frames are out of plane with respect to the first PMAP frame. " +
        //             "This is not yet supported. Aborting parametric map loading."
        //     );
        // }

        const imageId = findReferenceSourceImageId(
            multiframe,
            i,
            imageIds,
            metadataProvider,
            tolerance,
            sopUIDImageIdIndexMap
        );

        if (!imageId) {
            console.warn(
                "Image not present in stack, can't import frame : " + i + "."
            );
            continue;
        }

        const sourceImageMetadata = imageIdMaps.metadata[imageId];
        if (
            Rows !== sourceImageMetadata.Rows ||
            Columns !== sourceImageMetadata.Columns
        ) {
            throw new Error(
                "Parametric map have different geometry dimensions (Rows and Columns) " +
                    "respect to the source image reference frame. This is not yet supported."
            );
        }

        const imageIdIndex = imageIdMaps.indices[imageId];
        const byteOffset =
            sliceLength * imageIdIndex * targetPixelData.BYTES_PER_ELEMENT;
        const targetSliceDataView = new targetPixelData.constructor(
            targetPixelData.buffer,
            byteOffset,
            sliceLength
        );

        // Copy from source to target with no changes until we find a parametric map with different orientation
        targetSliceDataView.set(sourceSliceDataView);

        // TODO: load a parametric map with different orientation and fix this code
        //
        // const { data } = alignedPixelDataI;
        //
        // for (let j = 0, len = alignedPixelDataI.data.length; j < len; ++j) {
        //     if (data[j]) {
        //         for (let x = j; x < len; ++x) {
        //             if (data[x]) {
        //                 if (!overlapping && targetPixelDataView[x] !== 0) {
        //                     overlapping = true;
        //                 }
        //                 targetPixelDataView[x] = segmentIndex;
        //             }
        //         }
        //
        //         break;
        //     }
        // }
    }

    return targetPixelData;
}

function checkOrientation(
    multiframe,
    validOrientations,
    sourceDataDimensions,
    tolerance
) {
    const { SharedFunctionalGroupsSequence, PerFrameFunctionalGroupsSequence } =
        multiframe;

    const sharedImageOrientationPatient =
        SharedFunctionalGroupsSequence.PlaneOrientationSequence
            ? SharedFunctionalGroupsSequence.PlaneOrientationSequence
                  .ImageOrientationPatient
            : undefined;

    // Check if in plane.
    const PerFrameFunctionalGroups = PerFrameFunctionalGroupsSequence[0];

    const iop =
        sharedImageOrientationPatient ||
        PerFrameFunctionalGroups.PlaneOrientationSequence
            .ImageOrientationPatient;

    const inPlane = validOrientations.some(operation =>
        compareArrays(iop, operation, tolerance)
    );

    if (inPlane) {
        return "Planar";
    }

    if (
        checkIfPerpendicular(iop, validOrientations[0], tolerance) &&
        sourceDataDimensions.includes(multiframe.Rows) &&
        sourceDataDimensions.includes(multiframe.Columns)
    ) {
        // Perpendicular and fits on same grid.
        return "Perpendicular";
    }

    return "Oblique";
}

// TODO: Move it to a shared file
function checkIfPerpendicular(iop1, iop2, tolerance) {
    const absDotColumnCosines = Math.abs(
        iop1[0] * iop2[0] + iop1[1] * iop2[1] + iop1[2] * iop2[2]
    );
    const absDotRowCosines = Math.abs(
        iop1[3] * iop2[3] + iop1[4] * iop2[4] + iop1[5] * iop2[5]
    );

    return (
        (absDotColumnCosines < tolerance ||
            Math.abs(absDotColumnCosines - 1) < tolerance) &&
        (absDotRowCosines < tolerance ||
            Math.abs(absDotRowCosines - 1) < tolerance)
    );
}

function getPixelData(multiframe) {
    let TypedArrayClass;
    let data;

    if (multiframe.PixelData) {
        const validTypedArrays =
            multiframe.BitsAllocated === 16
                ? [Uint16Array, Int16Array]
                : [Uint32Array, Int32Array];

        TypedArrayClass = validTypedArrays[multiframe.PixelRepresentation ?? 0];
        data = multiframe.PixelData;
    } else if (multiframe.FloatPixelData) {
        TypedArrayClass = Float32Array;
        data = multiframe.FloatPixelData;
    } else if (multiframe.DoubleFloatPixelData) {
        TypedArrayClass = Float64Array;
        data = multiframe.DoubleFloatPixelData;
    }

    if (data === undefined) {
        log.error("This parametric map pixel data is undefined.");
    }

    if (Array.isArray(data)) {
        data = data[0];
    }

    return new TypedArrayClass(data);
}

// TODO: Move it to a shared file
function getImageIdOfSourceImageBySourceImageSequence(
    SourceImageSequence,
    sopUIDImageIdIndexMap
) {
    const { ReferencedSOPInstanceUID, ReferencedFrameNumber } =
        SourceImageSequence;

    return ReferencedFrameNumber
        ? getImageIdOfReferencedFrame(
              ReferencedSOPInstanceUID,
              ReferencedFrameNumber,
              sopUIDImageIdIndexMap
          )
        : sopUIDImageIdIndexMap[ReferencedSOPInstanceUID];
}

// TODO: Move it to a shared file
function getImageIdOfSourceImagebyGeometry(
    ReferencedSeriesInstanceUID,
    FrameOfReferenceUID,
    PerFrameFunctionalGroup,
    imageIds,
    metadataProvider,
    tolerance
) {
    if (
        ReferencedSeriesInstanceUID === undefined ||
        PerFrameFunctionalGroup.PlanePositionSequence === undefined ||
        PerFrameFunctionalGroup.PlanePositionSequence[0] === undefined ||
        PerFrameFunctionalGroup.PlanePositionSequence[0]
            .ImagePositionPatient === undefined
    ) {
        return undefined;
    }

    for (
        let imageIdsIndexc = 0;
        imageIdsIndexc < imageIds.length;
        ++imageIdsIndexc
    ) {
        const sourceImageMetadata = metadataProvider.get(
            "instance",
            imageIds[imageIdsIndexc]
        );

        if (
            sourceImageMetadata === undefined ||
            sourceImageMetadata.ImagePositionPatient === undefined ||
            sourceImageMetadata.FrameOfReferenceUID !== FrameOfReferenceUID ||
            sourceImageMetadata.SeriesInstanceUID !==
                ReferencedSeriesInstanceUID
        ) {
            continue;
        }

        if (
            compareArrays(
                PerFrameFunctionalGroup.PlanePositionSequence[0]
                    .ImagePositionPatient,
                sourceImageMetadata.ImagePositionPatient,
                tolerance
            )
        ) {
            return imageIds[imageIdsIndexc];
        }
    }
}

// TODO: Move it to a shared file
function getImageIdOfReferencedFrame(
    sopInstanceUid,
    frameNumber,
    sopUIDImageIdIndexMap
) {
    const imageId = sopUIDImageIdIndexMap[sopInstanceUid];

    if (!imageId) {
        return;
    }

    const imageIdFrameNumber = Number(imageId.split("frame=")[1]);

    return imageIdFrameNumber === frameNumber - 1 ? imageId : undefined;
}

// TODO: Move it to a shared file
function getValidOrientations(iop) {
    const orientations = [];

    // [0,  1,  2]: 0,   0hf,   0vf
    // [3,  4,  5]: 90,  90hf,  90vf
    // [6, 7]:      180, 270

    orientations[0] = iop;
    orientations[1] = flipIOP.h(iop);
    orientations[2] = flipIOP.v(iop);

    const iop90 = rotateDirectionCosinesInPlane(iop, Math.PI / 2);

    orientations[3] = iop90;
    orientations[4] = flipIOP.h(iop90);
    orientations[5] = flipIOP.v(iop90);

    orientations[6] = rotateDirectionCosinesInPlane(iop, Math.PI);
    orientations[7] = rotateDirectionCosinesInPlane(iop, 1.5 * Math.PI);

    return orientations;
}

// TODO: Move it to a shared file
// function alignPixelDataWithSourceData(
//     pixelData2D,
//     iop,
//     orientations,
//     tolerance
// ) {
//     if (compareArrays(iop, orientations[0], tolerance)) {
//         return pixelData2D;
//     } else if (compareArrays(iop, orientations[1], tolerance)) {
//         // Flipped vertically.
//
//         // Undo Flip
//         return flipMatrix2D.v(pixelData2D);
//     } else if (compareArrays(iop, orientations[2], tolerance)) {
//         // Flipped horizontally.
//
//         // Unfo flip
//         return flipMatrix2D.h(pixelData2D);
//     } else if (compareArrays(iop, orientations[3], tolerance)) {
//         //Rotated 90 degrees
//
//         // Rotate back
//         return rotateMatrix902D(pixelData2D);
//     } else if (compareArrays(iop, orientations[4], tolerance)) {
//         //Rotated 90 degrees and fliped horizontally.
//
//         // Undo flip and rotate back.
//         return rotateMatrix902D(flipMatrix2D.h(pixelData2D));
//     } else if (compareArrays(iop, orientations[5], tolerance)) {
//         // Rotated 90 degrees and fliped vertically
//
//         // Unfo flip and rotate back.
//         return rotateMatrix902D(flipMatrix2D.v(pixelData2D));
//     } else if (compareArrays(iop, orientations[6], tolerance)) {
//         // Rotated 180 degrees. // TODO -> Do this more effeciently, there is a 1:1 mapping like 90 degree rotation.
//
//         return rotateMatrix902D(rotateMatrix902D(pixelData2D));
//     } else if (compareArrays(iop, orientations[7], tolerance)) {
//         // Rotated 270 degrees
//
//         // Rotate back.
//         return rotateMatrix902D(
//             rotateMatrix902D(rotateMatrix902D(pixelData2D))
//         );
//     }
// }

// TODO: Move it to a shared file
function compareArrays(array1, array2, tolerance) {
    if (array1.length != array2.length) {
        return false;
    }

    for (let i = 0; i < array1.length; ++i) {
        if (!nearlyEqual(array1[i], array2[i], tolerance)) {
            return false;
        }
    }

    return true;
}

const ParametricMapObj = {
    generateParametricMap,
    generateToolState
};

export { ParametricMapObj as default, ParametricMapObj as ParametricMap };
